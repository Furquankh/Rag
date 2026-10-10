# Local RAG Document Assistant

A professional, college-project-ready Retrieval-Augmented Generation (RAG) document assistant that runs **entirely locally** on a single computer. No API keys. No cloud AI. No external database. Everything stays in memory.

---

## What This Project Does

This application demonstrates a real RAG pipeline:

1. **Upload** a PDF or TXT document
2. **Extract** text locally using PyMuPDF
3. **Clean** and **chunk** the text into meaningful segments
4. **Generate embeddings** locally with `all-MiniLM-L6-v2`
5. **Retrieve** the most relevant chunks using cosine similarity
6. **Generate** a grounded answer using the local `distilgpt2` LLM
7. **Show sources** — the exact chunks and approximate pages used for the answer
8. **Prevent hallucinations** — if the answer isn't in the document, it clearly says so

---

## Architecture

```
Project Root
├── app.py                 # Python backend (Flask) — single server file
├── requirements.txt       # Python dependencies
├── src/App.tsx            # React frontend
├── src/index.css          # Professional theme styles
├── index.html             # HTML entry
└── package.json           # Frontend dependencies
```

No `frontend/`, `backend/`, `database/` folders. As close to a single-file architecture as practical.

---

## Installation & Setup

### 1. Clone / Extract

No special clone needed — this is the complete source.

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

The `requirements.txt` includes:

- `flask`, `flask-cors`
- `pymupdf` (PDF extraction)
- `sentence-transformers` (local embeddings: `all-MiniLM-L6-v2`)
- `transformers`, `torch` (local LLM: `distilgpt2`)
- `numpy`

### 3. First-Time Model Download (One-Time Only)

The first time you run the server, it downloads the models (~500 MB total) to a local `models/` folder:

- **Embedding model**: `all-MiniLM-L6-v2` (~23 MB)
- **LLM**: `distilgpt2` (~350 MB)

These are downloaded from Hugging Face's public repository and cached locally. After this, the application runs **offline**.

### 4. Start the Python Backend

In one terminal:

```bash
python app.py
```

You should see:

```
============================================================
LOCAL RAG DOCUMENT ASSISTANT SERVER
============================================================
Embedding model: all-MiniLM-L6-v2 (Ready: True)
LLM model: distilgpt2 (Ready: True)
Mode: LOCAL / OFFLINE / NO DATABASE / NO API KEYS
============================================================
```

### 5. Start the Frontend

In another terminal:

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` (or whatever port Vite shows).

---

## Running the Application

### Normal Usage Flow

1. Open the web page
2. Click **Choose Document** or drag-and-drop a `.pdf` or `.txt` file
3. Wait for the status: **Reading document...** → **Creating document index...** → **Ready**
4. Ask questions — the assistant responds using **only** the uploaded document
5. Click **Sources** under any answer to see which chunks/pages were used
6. Ask something **not** in the document to see:  
   **"I couldn't find this information in the uploaded document."**

### Running Fully Offline

Once the models are downloaded:

- Disconnect from the internet
- Restart the server with `python app.py`
- The application continues to work with no network connection

---

## Key Design Decisions

### Why `distilgpt2`?
- Small footprint (~350 MB) suitable for ordinary laptops
- Runs locally without GPU
- Good enough for demonstration-level text generation

### Why `all-MiniLM-L6-v2`?
- Very lightweight embedding model (~23 MB)
- Excellent balance of speed and quality for similarity search
- Runs quickly on CPU

### Why No Database?
- All document text, chunks, and embeddings are stored in a Python dictionary (`SESSION_STORE`)
- Data disappears when the server stops — perfect for a session-based demo
- No MySQL, MongoDB, PostgreSQL, Pinecone, Chroma, or Supabase

### Why This UI Design?
- Designed to look like a **real research/productivity tool**, not a generic AI chatbot
- Deep charcoal, warm off-white, muted green accent
- Clean typography, subtle borders, minimal shadows
- Three-section layout: sidebar navigation, document info, chat area

---

## RAG Pipeline Explained (For College Viva / Demo)

### Step 1: Text Extraction (`extract_text`)
- PDFs are read page-by-page with `fitz` (PyMuPDF)
- TXT files are read directly

### Step 2: Text Cleaning (`clean_text`)
- Collapses excessive whitespace and newlines
- Strips empty lines

### Step 3: Chunking (`chunk_text`)
- Splits text by paragraphs first
- If paragraphs are too large, falls back to sentence-level chunking
- Keeps ~300 characters per chunk with small overlap
- Each chunk gets an ID and an approximate page number

### Step 4: Embeddings (`compute_embeddings`)
- Each chunk is converted to a 384-dimensional vector by `all-MiniLM-L6-v2`
- Vectors are stored in memory as a NumPy array

### Step 5: Similarity Search (`retrieve_context`)
- The user's question is embedded using the same model
- Cosine similarity compares the question vector to every chunk vector
- Top 3 most similar chunks are selected as the context

### Step 6: Grounded Generation (`generate_answer`)
- A strict prompt is built that tells the model:  
  *"Use ONLY the document context below. If the answer is missing, say exactly: 'I couldn't find this information in the uploaded document.'"*
- The `distilgpt2` model generates a response from this prompt
- The output is shown with source references

### Step 7: Source Display
- Each assistant message shows expandable source cards
- Sources include approximate page number, chunk ID, similarity score, and the raw text snippet

---

## How to Demonstrate to a Professor

1. **Show Local Mode**: Point to the sidebar's **"Local Mode · Offline"** indicator
2. **Upload a PDF**: Show processing states (reading, indexing, ready)
3. **Ask a Present Question**: "What does the document say about X?" — show correct answer with sources
4. **Show Grounding**: Click **Sources** to reveal the exact chunk text used
5. **Show Not-Found Behavior**: Ask something clearly outside the document — show the exact fallback message
6. **Toggle Theme**: Click the sun/moon icon in the header to switch Light ↔ Dark
7. **Explain No Database**: Show that `SESSION_STORE` is just a Python dictionary in `app.py`
8. **Show Model Download**: Show the `models/` folder with the cached model files

---

## Important Security & Privacy Notes

- **No API keys** are required or stored anywhere
- **No document content** is sent to any external service
- **No analytics** are collected
- **No cookies** track user behavior  
- **Session data** is cleared when the Python server stops
- The application uses only `localhost` for all communication

---

## Troubleshooting

### "Failed to connect to the server"
- Make sure `python app.py` is running in a terminal
- Check that the port 5000 is not blocked
- Confirm the frontend points to `http://localhost:5000`

### "Embedding model not loaded"
- Run `pip install sentence-transformers torch numpy`
- The model may still be downloading; wait a few minutes

### "Local LLM not available"
- Run `pip install transformers torch`
- First startup downloads ~350 MB to `models/`

### PDF extraction fails
- Ensure the PDF is not password-protected or image-only (scanned)
- Image-only PDFs require OCR — not included in this demo

### Very slow responses
- The first question may take 5–15 seconds as models warm up
- Subsequent questions are faster due to cached embeddings
- `distilgpt2` is intentionally small; it is slower than cloud APIs but fully private

---

## Technical Requirements

- **OS**: Windows, macOS, or Linux
- **Python**: 3.9 or higher
- **RAM**: At least 2 GB (4 GB recommended for smooth performance)
- **Storage**: ~600 MB for model downloads
- **Internet**: Required only for the initial model download; fully offline afterward

---

## Project Files Overview

| File | Purpose |
|------|---------|
| `app.py` | Complete Flask backend with RAG pipeline |
| `src/App.tsx` | Professional React frontend with theme switching |
| `src/index.css` | Custom design system with light/dark variables |
| `index.html` | Page title and Google Fonts |
| `requirements.txt` | All Python dependencies |

---

## Version

`v1.0` — Demonstration-ready for college project evaluation.
