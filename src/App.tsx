/*
  ============================================================
  CONFIGURATION & IMPORTS
  ============================================================
*/

import { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Send,
  Sparkles,
  ShieldCheck,
  Moon,
  Sun,
  ChevronDown,
  ChevronUp,
  BookOpen,
  MessageSquare,
  Menu,
  X,
  Layers,
} from "lucide-react";

/*
  ============================================================
  TYPES
  ============================================================
*/

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceInfo[];
  timestamp?: number;
}

interface SourceInfo {
  chunk_id: number;
  approx_page: number;
  similarity: number;
  snippet: string;
}

interface DocumentInfo {
  filename: string;
  file_type: string;
  chunk_count: number;
  char_count: number;
}

/*
  ============================================================
  THEME CONTEXT
  ============================================================
*/

function useTheme(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("rag-theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("rag-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("rag-theme", "light");
    }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((d) => !d), []);
  return [isDark, toggle];
}

/*
  ============================================================
  SMALL COMPONENTS
  ============================================================
*/

function StatusDot({ active }: { active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase ${
        active ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      }`}
    >
      <span
        className={`inline-block h-[6px] w-[6px] rounded-full ${
          active ? "bg-emerald-500 dark:bg-emerald-400" : "bg-amber-500 dark:bg-amber-400"
        } ${active ? "animate-pulse" : ""}`}
      />
      {active ? "Ready" : "Offline"}
    </span>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle-dark)] bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] px-4 py-3 hover:border-[var(--color-accent)] dark:hover:border-[var(--color-accent-dark)] hover:bg-[var(--color-amber-soft)] dark:hover:bg-[var(--color-amber-soft-dark)] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-none"
    >
      <span className="block text-sm font-medium text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)] group-hover:text-[var(--color-ink)] dark:group-hover:text-[var(--color-ink-dark)] transition-colors">
        {label}
      </span>
      <span className="block text-[11px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] mt-0.5">Ask about document</span>
    </button>
  );
}

/*
  ============================================================
  MAIN APPLICATION
  ============================================================
*/

export default function App() {
  /* Theme */
  const [isDark, toggleTheme] = useTheme();

  /* App state */
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);



  /* ============================================================
     API COMMUNICATION
     ============================================================ */

  const apiUrl = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ? (import.meta as any).env.VITE_API_URL : "http://localhost:5000";

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/session`);
      if (res.ok) {
        const data = await res.json();
        if (data.has_document) {
          setDocumentInfo({
            filename: data.filename,
            file_type: data.file_type,
            chunk_count: data.chunk_count,
            char_count: data.char_count,
          });
          setMessages([]);
        }
      }
    } catch {
      // Silent
    }
  }, [apiUrl]);

  /* Fetch session on mount */
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  /* ============================================================
     DOCUMENT UPLOAD HANDLING
     ============================================================ */

  const handleFileUpload = useCallback(
    async (file: File) => {
      const allowed = [".pdf", ".txt", ".text"];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!allowed.includes(ext)) {
        alert("Unsupported file format. Please upload a PDF or TXT file.");
        return;
      }

      setProcessingStatus("Reading document...");

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${apiUrl}/upload`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setProcessingStatus("Creating document index...");
          setTimeout(() => {
            setDocumentInfo({
              filename: data.filename,
              file_type: data.file_type,
              chunk_count: data.chunk_count,
              char_count: data.char_count,
            });
            setProcessingStatus("");
            setMessages([]);
          }, 800);
        } else {
          setProcessingStatus("");
          alert(data.error || "Upload failed.");
        }
      } catch (e) {
        setProcessingStatus("");
        alert("Failed to connect to the server. Make sure the Python backend is running.");
      }
    },
    [apiUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  /* ============================================================
     CHAT / ASK QUESTION
     ============================================================ */

  const sendQuestion = useCallback(
    async (questionText?: string) => {
      const q = (questionText || inputValue).trim();
      if (!q) return;
      if (!documentInfo) {
        alert("Please upload a document first.");
        return;
      }

      setInputValue("");
      setIsLoading(true);
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: q,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch(`${apiUrl}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } else {
          const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "I encountered an error processing your question. Please try again.",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
      } catch {
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Connection error. Ensure the Python server is running locally.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);
      }
    },
    [apiUrl, documentInfo, inputValue]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion();
  };

  /* ============================================================
     CLEAR / REMOVE
     ============================================================ */

  const removeDocument = useCallback(async () => {
    try {
      await fetch(`${apiUrl}/clear`, { method: "POST" });
    } catch {
      // Best effort
    }
    setDocumentInfo(null);
    setMessages([]);
    setProcessingStatus("");
  }, [apiUrl]);

  /* ============================================================
     SUGGESTIONS
     ============================================================ */

  const suggestions = [
    { label: "Summarize this document.", q: "Summarize this document." },
    { label: "What are the main points?", q: "What are the main points?" },
    { label: "Explain this in simple words.", q: "Explain the key concepts in simple words." },
    { label: "What does the document say about this?", q: "What does the document say about the main topic?" },
  ];

  /* ============================================================
     SOURCE EXPANSION
     ============================================================ */

  const toggleSource = (msgId: string) => {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  /* ============================================================
     AUTO-SCROLL
     ============================================================ */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div
      className={`min-h-screen w-full transition-colors duration-300 ${
        isDark ? "dark" : ""
      }`}
      style={{ backgroundColor: isDark ? "#161614" : "#F6F4F0" }}
    >
      <div className="flex h-screen overflow-hidden">
        {/* ------------------------------------------------------ */}
        {/* LEFT SIDEBAR */}
        {/* ------------------------------------------------------ */}
        <aside
          className={`hidden md:flex flex-col shrink-0 w-[260px] border-r transition-colors duration-300 ${
            isDark
              ? "bg-[#181816] border-[#2A2824]"
              : "bg-[#FAF9F6] border-[#E0DDD4]"
          }`}
        >
          {/* Logo / Title */}
          <div className="px-6 pt-7 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div
                className={`flex items-center justify-center h-9 w-9 rounded-lg shadow-sm ${
                  isDark ? "bg-[#1F2D27]" : "bg-[#E8EFEA]"
                }`}
              >
                <Layers className="h-5 w-5 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold tracking-tight text-[var(--color-ink)] dark:text-[var(--color-ink-dark)] leading-tight">
                  RAG Assistant
                </h1>
                <span className="text-[10px] font-medium tracking-widest uppercase text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)]">
                  Document Intelligence
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 pt-2 overflow-y-auto">
            <div className="space-y-0.5">
              <NavItem
                icon={<Upload className="h-4 w-4" />}
                label="New Document"
                active={!documentInfo}
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
              />
              <NavItem
                icon={<FileText className="h-4 w-4" />}
                label="Current Document"
                active={!!documentInfo}
                onClick={() => {
                  if (documentInfo && documentInfo.filename) {
                    // Already shown; do nothing special
                  }
                }}
                subtitle={documentInfo ? documentInfo.filename.slice(0, 18) + (documentInfo.filename.length > 18 ? "..." : "") : undefined}
              />
              <NavItem
                icon={<MessageSquare className="h-4 w-4" />}
                label="Chat"
                active={!!documentInfo && messages.length > 0}
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
              />
              <NavItem
                icon={<BookOpen className="h-4 w-4" />}
                label="Document Info"
                active={false}
                onClick={() => {}}
                subtitle={documentInfo ? `${documentInfo.chunk_count} chunks · ${formatChars(documentInfo.char_count)}` : undefined}
              />
            </div>

            {/* Status Card */}
            <div
              className={`mt-6 mx-2 rounded-xl border p-4 transition-colors duration-300 ${
                isDark
                  ? "bg-[#1E1D1B] border-[#2A2824]"
                  : "bg-white border-[#E0DDD4] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]">
                  System Status
                </h3>
              </div>
              <div className="space-y-2.5">
                <StatusRow label="Mode" value="Local / Offline" />
                <StatusRow label="LLM" value="distilgpt2" />
                <StatusRow label="Embeddings" value="all-MiniLM-L6-v2" />
                <StatusRow label="Database" value="In-memory only" />
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle-dark)] flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)]">
                  Ready for analysis
                </span>
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div
            className={`px-5 py-4 border-t transition-colors duration-300 ${
              isDark ? "border-[#2A2824]" : "border-[#E0DDD4]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-[7px] w-[7px] rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-medium text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]">
                  Local Mode
                </span>
              </div>
              <span className="text-[10px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] font-mono">
                v1.0
              </span>
            </div>
            <div className="mt-1.5 text-[10px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)]">
              Documents stay on your computer.
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------ */}
        {/* MAIN CONTENT */}
        {/* ------------------------------------------------------ */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <header
            className={`flex items-center justify-between px-6 md:px-10 py-4 border-b shrink-0 transition-colors duration-300 ${
              isDark
                ? "bg-[#161614]/80 backdrop-blur-md border-[#2A2824]"
                : "bg-[#F6F4F0]/80 backdrop-blur-md border-[#E0DDD4]"
            }`}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className="md:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--color-paper-deep)] dark:hover:bg-[#1E1D1B] transition-colors"
                aria-label="Toggle navigation"
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div>
                <h2 className="text-[17px] font-bold tracking-tight text-[var(--color-ink)] dark:text-[var(--color-ink-dark)] leading-none">
                  Document Assistant
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot active={!!documentInfo} />
                  <span className="text-[10px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] font-medium tracking-wide">
                    Local RAG · Document-grounded answers
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle-dark)] hover:bg-[var(--color-paper-deep)] dark:hover:bg-[#1E1D1B] text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]"
                aria-label="Toggle theme"
                title="Toggle light/dark"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
              </button>
            </div>
          </header>

          {/* Mobile Nav Overlay */}
          {mobileNavOpen && (
            <div
              className="md:hidden fixed inset-0 z-40 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
          )}

          <div className="flex-1 overflow-y-auto relative">
            <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
              {/* -------------------------------------------------- */}
              {/* EMPTY STATE (No Document) */}
              {/* -------------------------------------------------- */}
              {!documentInfo && (
                <div className="flex flex-col items-center justify-center min-h-[70vh] text-center animate-[fadeUp_0.5s_ease]">
                  <div
                    className={`h-20 w-20 rounded-2xl flex items-center justify-center mb-8 shadow-lg transition-colors ${
                      isDark ? "bg-[#1F2D27] shadow-black/20" : "bg-[#E8EFEA] shadow-[0_8px_30px_rgba(74,107,94,0.10)]"
                    }`}
                  >
                    <FileText className="h-9 w-9 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
                  </div>

                  <h3 className="text-2xl md:text-[28px] font-bold tracking-tight text-[var(--color-ink)] dark:text-[var(--color-ink-dark)] mb-3">
                    Upload a document to start
                  </h3>
                  <p className="text-[15px] text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)] max-w-md mb-8 leading-relaxed">
                    This assistant analyzes your file locally. No data leaves your computer. Answers are grounded only in the uploaded content.
                  </p>

                  {/* Upload Area */}
                  <div
                    ref={uploadAreaRef}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative w-full max-w-md rounded-2xl border-2 border-dashed p-8 md:p-10 transition-all duration-300 cursor-pointer group ${
                      isDark
                        ? "border-[#35322E] hover:border-[var(--color-accent-dark)] bg-[#181816]/60 hover:bg-[#1E1D1B]/80"
                        : "border-[#D5D1C8] hover:border-[var(--color-accent)] bg-[#FAF9F6]/80 hover:bg-[#FFFFFF] shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(74,107,94,0.06)]"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center mb-5 transition-colors ${
                          isDark ? "bg-[#1F2D27]" : "bg-[#E8EFEA]"
                        }`}
                      >
                        <Upload className="h-6 w-6 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
                      </div>
                      <h4 className="text-[17px] font-bold text-[var(--color-ink)] dark:text-[var(--color-ink-dark)] mb-1.5">
                        Drop your document here
                      </h4>
                      <p className="text-[13px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] mb-5">
                        Supported formats: <span className="font-semibold text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]">PDF · TXT</span>
                      </p>
                      <span
                        className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-all ${
                          isDark
                            ? "bg-[var(--color-accent-dark)] text-[var(--color-ink-dark)] hover:bg-[#4A6E62]"
                            : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)]"
                        }`}
                      >
                        Choose Document
                      </span>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.text"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              )}

              {/* -------------------------------------------------- */}
              {/* DOCUMENT HEADER (After Upload) */}
              {/* -------------------------------------------------- */}
              {documentInfo && (
                <div className="animate-[fadeUp_0.4s_ease]">
                  {/* Document Status Card */}
                  <div
                    className={`rounded-2xl border p-6 mb-8 transition-colors duration-300 ${
                      isDark
                        ? "bg-[#181816] border-[#2A2824] shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                        : "bg-white border-[#E0DDD4] shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div
                          className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center shadow-sm ${
                            isDark ? "bg-[#1F2D27]" : "bg-[#E8EFEA]"
                          }`}
                        >
                          <FileText className="h-6 w-6 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[16px] font-bold text-[var(--color-ink)] dark:text-[var(--color-ink-dark)] truncate">
                              {documentInfo.filename}
                            </h3>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                                documentInfo.file_type === ".pdf"
                                  ? isDark
                                    ? "bg-rose-soft-dark text-rose-300"
                                    : "bg-rose-soft text-rose-700"
                                  : isDark
                                  ? "bg-sky-900/40 text-sky-300"
                                  : "bg-sky-50 text-sky-700"
                              }`}
                            >
                              {documentInfo.file_type.toUpperCase().replace(".", "")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)]">
                            <span className="flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5" />
                              {documentInfo.chunk_count} chunks
                            </span>
                            <span>·</span>
                            <span>{formatChars(documentInfo.char_count)} chars</span>
                            {processingStatus && (
                              <>
                                <span>·</span>
                                <span className="text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] animate-pulse">
                                  {processingStatus}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] mt-2">
                            All processing is done locally. Your document never leaves this device.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={removeDocument}
                        className="p-2.5 rounded-xl hover:bg-[var(--color-rose-soft)] dark:hover:bg-[var(--color-rose-soft-dark)] transition-colors text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                        title="Remove document"
                        aria-label="Remove document"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Suggested Questions */}
                  {messages.length === 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                      {suggestions.map((s) => (
                        <SuggestionChip
                          key={s.q}
                          label={s.label}
                          onClick={() => sendQuestion(s.q)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Chat Area */}
                  <div
                    className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${
                      isDark ? "bg-[#181816] border-[#2A2824]" : "bg-white border-[#E0DDD4] shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                    }`}
                  >
                    {/* Messages */}
                    <div className="p-6 md:p-8 min-h-[280px] max-h-[55vh] overflow-y-auto space-y-6">
                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[160px] text-center">
                          <Sparkles className="h-8 w-8 text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] mb-3" />
                          <p className="text-[15px] font-medium text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)] mb-1">
                            Ask something about your document
                          </p>
                          <p className="text-[12px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)]">
                            The assistant will answer only from the uploaded file.
                          </p>
                        </div>
                      )}

                      {messages.map((msg) => (
                        <div key={msg.id} className="animate-[fadeUp_0.3s_ease]">
                          {/* User bubble */}
                          {msg.role === "user" && (
                            <div className="flex justify-end">
                              <div
                                className={`inline-flex items-start gap-2 rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm ${
                                  isDark
                                    ? "bg-[#1F2D27] text-[var(--color-ink-dark)]"
                                    : "bg-[var(--color-ink)] text-white"
                                }`}
                              >
                                <span className="text-[14px] leading-relaxed font-normal">{msg.content}</span>
                                <span className="text-[10px] text-white/50 mt-auto shrink-0">{formatTime(msg.timestamp)}</span>
                              </div>
                            </div>
                          )}

                          {/* Assistant bubble */}
                          {msg.role === "assistant" && (
                            <div className="flex gap-3">
                              <div
                                className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center shadow-sm ${
                                  msg.content.includes("couldn't find") || msg.content.includes("not present")
                                    ? isDark ? "bg-[#2A2618]" : "bg-[#F5EFE6]"
                                    : isDark ? "bg-[#1F2D27]" : "bg-[#E8EFEA]"
                                }`}
                              >
                                <Sparkles
                                  className={`h-4 w-4 ${
                                    msg.content.includes("couldn't find") || msg.content.includes("not present")
                                      ? "text-amber-500 dark:text-amber-400"
                                      : "text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]"
                                  }`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`inline-block rounded-2xl px-5 py-3.5 border ${
                                    msg.content.includes("couldn't find") || msg.content.includes("not present")
                                      ? isDark
                                        ? "bg-[#2A2018]/60 border-[#3A3024] text-amber-200"
                                        : "bg-[#F5EFE6]/60 border-[#EBE5D8] text-amber-800"
                                      : isDark
                                      ? "bg-[#1E1D1B] border-[#2A2824] text-[var(--color-ink-dark)]"
                                      : "bg-[var(--color-surface)] border-[#EDECEA] text-[var(--color-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                                  }`}
                                >
                                  <p className="text-[14px] leading-[1.65] font-normal">{msg.content}</p>
                                </div>

                                {/* Source Panel */}
                                {msg.sources && msg.sources.length > 0 && !msg.content.includes("couldn't find") && (
                                  <div className="mt-3">
                                    <button
                                      onClick={() => toggleSource(msg.id)}
                                      className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] hover:text-[var(--color-ink-secondary)] dark:hover:text-[var(--color-ink-secondary-dark)] transition-colors"
                                    >
                                      Sources
                                      {expandedSources[msg.id] ? (
                                        <ChevronUp className="h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </button>
                                    {expandedSources[msg.id] && (
                                      <div
                                        className={`mt-2 rounded-xl border overflow-hidden transition-all ${
                                          isDark ? "bg-[#161614] border-[#2A2824]" : "bg-[#FAF9F6] border-[#E0DDD4]"
                                        }`}
                                      >
                                        {msg.sources.map((src, i) => (
                                          <div
                                            key={i}
                                            className={`px-4 py-3.5 ${
                                              i !== msg.sources!.length - 1
                                                ? isDark ? "border-b border-[#2A2824]" : "border-b border-[#EDECEA]"
                                                : ""
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 mb-1.5">
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-accent-soft)] dark:bg-[var(--color-accent-soft-dark)] text-[var(--color-accent-strong)] dark:text-[var(--color-accent-dark)]">
                                                Page ~{src.approx_page}
                                              </span>
                                              <span className="text-[10px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] font-mono">
                                                Chunk {src.chunk_id}
                                              </span>
                                              <span className="text-[10px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] ml-auto font-medium">
                                                Relevance: {(src.similarity * 100).toFixed(1)}%
                                              </span>
                                            </div>
                                            <p className="text-[12px] text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)] leading-relaxed font-serif italic">
                                              "{src.snippet}"
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input */}
                    <div
                      className={`border-t px-5 md:px-6 py-4 transition-colors duration-300 ${
                        isDark ? "bg-[#161614] border-[#2A2824]" : "bg-[#FAF9F6] border-[#EDECEA]"
                      }`}
                    >
                      <form onSubmit={handleSubmit} className="flex items-end gap-3">
                        <input
                          type="text"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e);
                            }
                          }}
                          placeholder="Ask something about your document..."
                          disabled={isLoading || !documentInfo}
                          className={`flex-1 rounded-xl px-4 py-3 text-[14px] border transition-all outline-none shadow-sm
                            ${
                              isDark
                                ? "bg-[#1E1D1B] border-[#35322E] text-[var(--color-ink-dark)] placeholder:text-[var(--color-ink-faint-dark)] focus:border-[var(--color-accent-dark)] focus:ring-1 focus:ring-[var(--color-accent-dark)]/20"
                                : "bg-white border-[#D5D1C8] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/20"
                            }
                            disabled:opacity-60 disabled:cursor-not-allowed
                          `}
                        />
                        <button
                          type="submit"
                          disabled={isLoading || !documentInfo || !inputValue.trim()}
                          className={`h-[46px] w-[46px] rounded-xl flex items-center justify-center shadow-sm transition-all duration-200 shrink-0
                            ${
                              isLoading || !documentInfo || !inputValue.trim()
                                ? isDark ? "bg-[#2A2824] text-[var(--color-ink-faint-dark)]" : "bg-[#EDECEA] text-[var(--color-ink-faint)]"
                                : isDark ? "bg-[var(--color-accent-dark)] text-[var(--color-ink-dark)] hover:bg-[#4A6E62] hover:shadow-md hover:-translate-y-0.5" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] hover:shadow-md hover:-translate-y-0.5"
                            }
                          `}
                          aria-label="Send"
                          title="Send"
                        >
                          {isLoading ? (
                            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </form>
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-[11px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)]">
                          Press <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--color-paper-deep)] dark:bg-[#1E1D1B] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle-dark)] mx-0.5">Enter</kbd> to send
                        </p>
                        <button
                          onClick={() => setMessages([])}
                          className="text-[11px] font-medium text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] hover:text-[var(--color-ink-secondary)] dark:hover:text-[var(--color-ink-secondary-dark)] transition-colors"
                        >
                          Clear chat
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ */
/* HELPER COMPONENTS                                          */
/* ------------------------------------------------------ */

function NavItem({
  icon,
  label,
  active,
  onClick,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  subtitle?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${
        active
          ? "bg-[var(--color-amber-soft)] dark:bg-[var(--color-amber-soft-dark)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          : "hover:bg-[var(--color-paper-deep)] dark:hover:bg-[#1E1D1B] border border-transparent hover:border-[var(--color-border-subtle)] dark:hover:border-[var(--color-border-subtle-dark)]"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 transition-colors ${
          active
            ? "text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]"
            : "text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)] group-hover:text-[var(--color-ink-secondary)] dark:group-hover:text-[var(--color-ink-secondary-dark)]"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <span
          className={`block text-[13px] font-semibold transition-colors ${
            active ? "text-[var(--color-ink)] dark:text-[var(--color-ink-dark)]" : "text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]"
          }`}
        >
          {label}
        </span>
        {subtitle && (
          <span className="block text-[11px] text-[var(--color-ink-faint)] dark:text-[var(--color-ink-faint-dark)] truncate mt-0.5 max-w-[180px]">
            {subtitle}
          </span>
        )}
      </div>
    </button>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-ink-muted)] dark:text-[var(--color-ink-muted-dark)]">{label}</span>
      <span className="text-[11px] font-medium text-[var(--color-ink-secondary)] dark:text-[var(--color-ink-secondary-dark)]">{value}</span>
    </div>
  );
}

function formatChars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
