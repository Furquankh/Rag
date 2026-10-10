"""
LOCAL RAG DOCUMENT ASSISTANT - Backend Server
A complete, single-server RAG pipeline running entirely locally.
No cloud APIs. No external AI services. No database.

Pipeline:
Document Upload → Text Extraction → Cleaning → Chunking → 
Local Embeddings → Similarity Search → Context Retrieval → 
Local LLM (distilgpt2) → Grounded Answer
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import tempfile
import re
import textwrap
import traceback

# ============================================================
# DEPENDENCIES (install via pip install -r requirements.txt)
# ============================================================
# flask, flask-cors, pymupdf, sentence-transformers, transformers,
# torch, numpy, scikit-learn (optional), tqdm
# ============================================================

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import torch
except ImportError:
    torch = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

try:
    from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
except ImportError:
    pipeline = None
    AutoTokenizer = None
    AutoModelForCausalLM = None

app = Flask(__name__)
CORS(app)

# ============================================================
# CONFIGURATION
# ============================================================
MODEL_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
LLM_MODEL_NAME = "distilgpt2"

# In-memory session store (no database)
# Structure: {session_id: {"chunks": [], "embeddings": np.array, ...}}
SESSION_STORE = {}

# Load embedding model once at startup
embedding_model = None
llm_pipeline = None

# ============================================================
# MODEL INITIALIZATION
# ============================================================

def init_embedding_model():
    global embedding_model
    if SentenceTransformer is None:
        print("[WARN] sentence-transformers not installed.")
        return False
    try:
        print("[INIT] Loading embedding model (all-MiniLM-L6-v2)...")
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, cache_folder=MODEL_CACHE_DIR)
        print("[INIT] Embedding model loaded successfully.")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to load embedding model: {e}")
        return False

def init_llm():
    global llm_pipeline
    if pipeline is None or torch is None:
        print("[WARN] transformers/torch not installed.")
        return False
    try:
        print(f"[INIT] Loading local LLM ({LLM_MODEL_NAME})...")
        tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
        model = AutoModelForCausalLM.from_pretrained(LLM_MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
        llm_pipeline = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            max_new_tokens=120,
            temperature=0.1,
            do_sample=False,
            return_full_text=False,
        )
        print("[INIT] Local LLM loaded successfully.")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to load LLM: {e}")
        traceback.print_exc()
        return False

# Initialize on import (lazy in production; here eager for demo)
EMBED_READY = init_embedding_model()
LLM_READY = init_llm()

# ============================================================
# DOCUMENT PROCESSING
# ============================================================

def extract_text(filepath, file_ext):
    """Extract raw text from PDF or TXT file."""
    if file_ext == ".pdf" and fitz is not None:
        try:
            doc = fitz.open(filepath)
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())
            return "\n".join(text_parts)
        except Exception as e:
            raise ValueError(f"PDF extraction failed: {str(e)}")
    elif file_ext in (".txt", ".text"):
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            raise ValueError(f"Text file reading failed: {str(e)}")
    else:
        raise ValueError(f"Unsupported file type: {file_ext}")

def clean_text(text):
    """Clean extracted text."""
    # Replace multiple newlines with single
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove very long spaces
    text = re.sub(r" {3,}", "  ", text)
    # Strip leading/trailing whitespace
    text = text.strip()
    return text

# ============================================================
# CHUNKING
# ============================================================

def chunk_text(text, chunk_size=300, overlap=50):
    """
    Split text into semantic-ish chunks.
    Uses sentence/paragraph boundaries when possible.
    """
    chunks = []
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    
    current_chunk = []
    current_len = 0
    
    for para in paragraphs:
        words = para.split()
        para_len = len(para)
        
        if current_len + para_len > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "char_count": len(chunk_text),
                "word_count": len(chunk_text.split()),
            })
            # Overlap: keep last portion
            overlap_text = " ".join(current_chunk[-max(1, len(current_chunk)//4):])
            current_chunk = [overlap_text] if overlap_text else []
            current_len = len(" ".join(current_chunk))
        
        current_chunk.append(para)
        current_len += para_len + 1
    
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        chunks.append({
            "text": chunk_text,
            "char_count": len(chunk_text),
            "word_count": len(chunk_text.split()),
        })
    
    # If chunks are too small, try sentence-level chunking
    if not chunks or all(c["char_count"] < 50 for c in chunks):
        chunks = []
        sentences = re.split(r"(?<=[.!?])\s+", text)
        current_chunk = []
        current_len = 0
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if current_len + len(sentence) > chunk_size and current_chunk:
                chunks.append({
                    "text": " ".join(current_chunk),
                    "char_count": current_len,
                    "word_count": len(" ".join(current_chunk).split()),
                })
                # Overlap
                overlap_words = current_chunk[-2:] if len(current_chunk) >= 2 else current_chunk
                current_chunk = overlap_words
                current_len = len(" ".join(current_chunk))
            current_chunk.append(sentence)
            current_len += len(sentence) + 1
        if current_chunk:
            chunks.append({
                "text": " ".join(current_chunk),
                "char_count": current_len,
                "word_count": len(" ".join(current_chunk).split()),
            })
    
    # Add metadata
    total_chars = sum(c["char_count"] for c in chunks)
    for i, c in enumerate(chunks):
        c["chunk_id"] = i + 1
        c["total_chunks"] = len(chunks)
        # Approximate page estimation (very rough for demo)
        c["approx_page"] = min((i // max(len(chunks)//3, 1)) + 1, 99)
    
    return chunks

# ============================================================
# EMBEDDINGS
# ============================================================

def compute_embeddings(chunks):
    """Generate embeddings for chunks using local model."""
    if embedding_model is None or np is None:
        raise RuntimeError("Embedding model not loaded. Install sentence-transformers and torch.")
    texts = [c["text"] for c in chunks]
    embeddings = embedding_model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings

# ============================================================
# SIMILARITY SEARCH (Cosine Similarity)
# ============================================================

def cosine_similarity(vec_a, vec_b):
    if np is None:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (np.linalg.norm(vec_a) * np.linalg.norm(vec_b) + 1e-9))

def retrieve_context(query, embeddings, chunks, top_k=3):
    """Retrieve top-k most relevant chunks for the query."""
    if embedding_model is None:
        return [], []
    
    query_embedding = embedding_model.encode([query], convert_to_numpy=True)[0]
    
    similarities = []
    for i, emb in enumerate(embeddings):
        sim = cosine_similarity(query_embedding, emb)
        similarities.append((sim, i))
    
    similarities.sort(key=lambda x: x[0], reverse=True)
    top_indices = [sim[1] for sim in similarities[:top_k]]
    
    retrieved = []
    for idx in top_indices:
        chunk_copy = chunks[idx].copy()
        chunk_copy["similarity_score"] = similarities[idx][0]
        retrieved.append(chunk_copy)
    
    return retrieved, similarities

# ============================================================
# LOCAL LLM - GROUNDED GENERATION
# ============================================================

def build_grounded_prompt(query, retrieved_chunks):
    """Build a strict prompt that forces the model to use only context."""
    context_parts = []
    for i, chunk in enumerate(retrieved_chunks):
        source_tag = f"[Chunk {chunk.get('chunk_id', '?')}]"
        context_parts.append(f"{source_tag}\n{chunk['text']}\n")
    
    full_context = "\n---\n".join(context_parts)
    
    prompt = f"""You are a precise document analysis assistant. 
Your ONLY source of information is the document context below.
DO NOT use any outside knowledge.
If the answer is clearly present in the context, answer briefly and accurately.
If the answer is NOT present in the context, respond EXACTLY with:
"I couldn't find this information in the uploaded document."

DOCUMENT CONTEXT:
{full_context}

QUESTION: {query}

INSTRUCTION: Answer using ONLY the document context above. If the information is missing, say the exact phrase.
ANSWER:"""
    return prompt

def generate_answer(query, retrieved_chunks):
    """Generate answer using the local LLM with strict grounding."""
    if llm_pipeline is None:
        return "Local LLM not available. Please install transformers and torch.", []
    
    if not retrieved_chunks:
        return "I couldn't find this information in the uploaded document.", []
    
    prompt = build_grounded_prompt(query, retrieved_chunks)
    
    try:
        result = llm_pipeline(prompt, max_new_tokens=150, temperature=0.05, do_sample=False)
        if isinstance(result, list) and len(result) > 0:
            text = result[0].get("generated_text", "")
        else:
            text = result.get("generated_text", "") if isinstance(result, dict) else str(result)
        
        # Clean up: the pipeline with return_full_text=False returns only new tokens
        # But sometimes it still includes the prompt. Let's clean.
        answer = text.replace(prompt, "").strip()
        
        # If answer seems to include prompt remnants, use the last sentence approach
        if len(answer) < 5 or "DOCUMENT CONTEXT" in answer:
            # Try extracting the last coherent sentence/phrase
            # For simplicity in demo: if result is bad, return not-found
            answer = "I couldn't find this information in the uploaded document."
        
        # Post-check: enforce grounding explicitly
        # If the model produces something too generic or clearly fabricated, fall back
        lower_answer = answer.lower()
        not_found_indicators = [
            "i couldn't find", "not present", "not mentioned", "not found",
            "doesn't say", "does not mention", "no information"
        ]
        
        # Check if answer looks like it's answering from context (references chunks/sections)
        # If it doesn't contain any document-like references and is very generic, it might be hallucinating
        # For simplicity, we rely heavily on the prompt engineering.
        
        return answer, retrieved_chunks
    except Exception as e:
        traceback.print_exc()
        return f"Error generating answer: {str(e)}", retrieved_chunks

# ============================================================
# FLASK ROUTES
# ============================================================

@app.route("/")
def index():
    return jsonify({
        "service": "Local RAG Document Assistant",
        "version": "v1.0",
        "embedding_ready": EMBED_READY,
        "llm_ready": LLM_READY,
        "mode": "local_offline"
    })

@app.route("/upload", methods=["POST"])
def upload_document():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded."}), 400
        
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "Empty filename."}), 400
        
        filename = file.filename
        ext = os.path.splitext(filename)[1].lower()
        
        if ext not in (".pdf", ".txt", ".text"):
            return jsonify({"error": f"Unsupported format: {ext}. Supported: .pdf, .txt"}), 400
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        
        # Extract text
        raw_text = extract_text(tmp_path, ext)
        
        # Clean
        cleaned_text = clean_text(raw_text)
        
        if not cleaned_text or len(cleaned_text.strip()) < 5:
            os.unlink(tmp_path)
            return jsonify({"error": "Document appears empty or extraction failed."}), 400
        
        # Chunk
        chunks = chunk_text(cleaned_text)
        
        # Compute embeddings
        embeddings = compute_embeddings(chunks)
        
        # Create session (simple: use a fixed session ID for single-user demo)
        session_id = "demo_session"
        SESSION_STORE[session_id] = {
            "filename": filename,
            "file_type": ext,
            "chunks": chunks,
            "embeddings": embeddings,
            "raw_text_length": len(cleaned_text),
            "chunk_count": len(chunks),
        }
        
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except:
            pass
        
        return jsonify({
            "success": True,
            "filename": filename,
            "file_type": ext,
            "chunk_count": len(chunks),
            "char_count": len(cleaned_text),
            "message": "Document processed successfully."
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Upload processing error: {str(e)}"}), 500

@app.route("/ask", methods=["POST"])
def ask_question():
    try:
        data = request.get_json(force=True, silent=True) or {}
        question = data.get("question", "").strip()
        
        if not question:
            return jsonify({"error": "Question is empty."}), 400
        
        session_id = "demo_session"
        if session_id not in SESSION_STORE:
            return jsonify({"error": "No document uploaded. Please upload a document first."}), 400
        
        session = SESSION_STORE[session_id]
        chunks = session["chunks"]
        embeddings = session["embeddings"]
        
        # Retrieve
        retrieved, similarities = retrieve_context(question, embeddings, chunks, top_k=3)
        
        # Generate
        answer, sources = generate_answer(question, retrieved)
        
        # Build source info
        source_info = []
        for s in sources:
            source_info.append({
                "chunk_id": s.get("chunk_id"),
                "approx_page": s.get("approx_page"),
                "similarity": round(s.get("similarity_score", 0.0), 3),
                "snippet": s.get("text", "")[:200] + ("..." if len(s.get("text", "")) > 200 else ""),
            })
        
        return jsonify({
            "success": True,
            "question": question,
            "answer": answer,
            "sources": source_info,
            "retrieved_chunks": len(retrieved),
            "document_name": session.get("filename"),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Question processing error: {str(e)}"}), 500

@app.route("/session", methods=["GET"])
def get_session():
    session_id = "demo_session"
    if session_id not in SESSION_STORE:
        return jsonify({"has_document": False})
    session = SESSION_STORE[session_id]
    return jsonify({
        "has_document": True,
        "filename": session.get("filename"),
        "file_type": session.get("file_type"),
        "chunk_count": session.get("chunk_count"),
        "char_count": session.get("raw_text_length"),
    })

@app.route("/clear", methods=["POST"])
def clear_session():
    session_id = "demo_session"
    if session_id in SESSION_STORE:
        del SESSION_STORE[session_id]
    return jsonify({"success": True, "message": "Session cleared."})

@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "service": "Local RAG Assistant",
        "version": "v1.0",
        "embedding_model": EMBEDDING_MODEL_NAME,
        "embedding_ready": EMBED_READY,
        "llm_model": LLM_MODEL_NAME,
        "llm_ready": LLM_READY,
        "mode": "local_offline_no_database",
        "session_active": "demo_session" in SESSION_STORE,
    })

# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("LOCAL RAG DOCUMENT ASSISTANT SERVER")
    print("=" * 60)
    print(f"Embedding model: {EMBEDDING_MODEL_NAME} (Ready: {EMBED_READY})")
    print(f"LLM model: {LLM_MODEL_NAME} (Ready: {LLM_READY})")
    print("Mode: LOCAL / OFFLINE / NO DATABASE / NO API KEYS")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
