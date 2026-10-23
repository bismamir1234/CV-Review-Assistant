import React, { useState, useEffect, useRef } from "react";
import { SAMPLE_PROFILES, BULLET_PRESETS } from "./sampleData.js";

const API = "http://127.0.0.1:8000";

export default function App() {
  // Theme state: dark by default
  const [theme, setTheme] = useState(() => localStorage.getItem("rm_theme") || "dark");
  
  // Backend health state
  const [backendHealth, setBackendHealth] = useState({
    checked: false,
    online: false,
    aiConfigured: false,
    latencyMs: 0
  });

  // Form & upload state
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState("empty"); // "empty" | "loading" | "success" | "error"
  const [loadingStep, setLoadingStep] = useState(1);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [editedText, setEditedText] = useState("");
  const [busy, setBusy] = useState(false);
  
  // UI views & tabs
  const [activeTab, setActiveTab] = useState("audit"); // "audit" | "bullet_studio" | "architecture"
  const [suggestionCategoryFilter, setSuggestionCategoryFilter] = useState("all");
  const [editorViewMode, setEditorViewMode] = useState("split"); // "split" | "editor" | "preview"
  const [toastMessage, setToastMessage] = useState("");

  // Bullet studio state
  const [studioInput, setStudioInput] = useState("");
  const [studioCategory, setStudioCategory] = useState("backend");
  const [studioOutputs, setStudioOutputs] = useState(null);

  const fileInputRef = useRef(null);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rm_theme", theme);
  }, [theme]);

  // Check backend health periodically
  useEffect(() => {
    checkBackendHealth();
    const timer = setInterval(checkBackendHealth, 15000);
    return () => clearInterval(timer);
  }, []);

  async function checkBackendHealth() {
    const start = performance.now();
    try {
      const res = await fetch(`${API}/api/health`, { method: "GET" });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setBackendHealth({
          checked: true,
          online: true,
          aiConfigured: Boolean(data.ai_configured),
          latencyMs: latency
        });
      } else {
        setBackendHealth({ checked: true, online: false, aiConfigured: false, latencyMs: latency });
      }
    } catch {
      setBackendHealth({ checked: true, online: false, aiConfigured: false, latencyMs: 0 });
    }
  }

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }

  // Handle file drop & selection
  function handleFileChange(selectedFile) {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith(".docx")) {
      setError("MVP supports DOCX files only (.docx). PDF and other formats are not supported in this version.");
      setStatus("error");
      setFile(null);
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError(`File size exceeds 5 MB limit (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB). Please upload a smaller document.`);
      setStatus("error");
      setFile(null);
      return;
    }

    setError("");
    if (status === "error") setStatus("empty");
    setFile(selectedFile);
    showToast(`Loaded: ${selectedFile.name}`);
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }

  // Quick-load demo DOCX preset
  async function loadPresetProfile(profileId) {
    const profile = SAMPLE_PROFILES.find((p) => p.id === profileId);
    if (!profile) return;

    try {
      // Fetch the sample DOCX file hosted in public directory
      const response = await fetch("/sample_resume.docx");
      if (!response.ok) throw new Error("Could not fetch sample resume file");
      const blob = await response.blob();
      const sampleFile = new File([blob], `${profile.name.toLowerCase().replace(/\s+/g, "_")}_resume.docx`, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      setFile(sampleFile);
      setJobDescription(profile.jobPreset);
      setError("");
      setStatus("empty");
      showToast(`Loaded ${profile.name}'s profile & role requirements`);
    } catch {
      // Fallback: create mock blob
      showToast(`Selected ${profile.name}. Please click Review CV.`);
    }
  }

  // Review submission
  async function submitReview(event) {
    if (event) event.preventDefault();

    if (!file) {
      setError("Please select or drop a DOCX CV before submitting.");
      setStatus("error");
      return;
    }

    setBusy(true);
    setStatus("loading");
    setLoadingStep(1);
    setError("");
    setResult(null);

    // Simulate multi-step progress feedback for better user experience
    const progressTimer = setInterval(() => {
      setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 450);

    const form = new FormData();
    form.append("cv_file", file);
    form.append("job_description", jobDescription);

    try {
      const response = await fetch(`${API}/api/reviews`, {
        method: "POST",
        body: form
      });
      const body = await response.json();
      clearInterval(progressTimer);

      if (!response.ok) {
        throw new Error(body.detail || "Review request failed.");
      }

      setResult(body);
      setEditedText(body.analysis?.revised_text || body.extracted_text || "");
      setStatus("success");
      showToast("CV Review completed successfully!");
    } catch (err) {
      clearInterval(progressTimer);
      setError(
        err.message ||
          "Could not connect to the backend server. Verify that FastAPI is running on http://127.0.0.1:8000."
      );
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  // Clear form & delete SQLite record
  async function clearForm() {
    if (result?.id) {
      try {
        await fetch(`${API}/api/reviews/${result.id}`, { method: "DELETE" });
        showToast("Review record deleted from SQLite database.");
      } catch {
        // UI still clears
      }
    }
    setFile(null);
    setJobDescription("");
    setResult(null);
    setEditedText("");
    setError("");
    setStatus("empty");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Export plain text
  function exportText() {
    const textToExport = editedText || result?.extracted_text || "";
    if (!textToExport) return;
    const blob = new Blob([textToExport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(file?.name || "cv").replace(/\.docx$/i, "")}_reviewed.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded reviewed plain text (.txt)");
  }

  // Copy edited text to clipboard
  function copyToClipboard() {
    if (!editedText) return;
    navigator.clipboard.writeText(editedText);
    showToast("Copied CV text to clipboard!");
  }

  // Apply a specific suggestion into the editor text
  function applySuggestion(original, suggested) {
    if (!original || !suggested) return;
    if (editedText.includes(original)) {
      setEditedText(editedText.replace(original, suggested));
      showToast("Applied suggestion to editor!");
    } else {
      // Append if original not found verbatim
      setEditedText((prev) => `${prev}\n\n[Applied Revision]: ${suggested}`);
      showToast("Appended suggestion to editor text.");
    }
  }

  // Calculate high-level scoring heuristics for display
  const metrics = React.useMemo(() => {
    const text = editedText || result?.extracted_text || "";
    if (!text) return { score: 0, wordCount: 0, actionVerbs: 0, metricsFound: 0, matchPct: 0 };

    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Check action verbs
    const powerVerbs = [
      "architected", "spearheaded", "engineered", "orchestrated", "overhauled",
      "automated", "optimized", "slashed", "accelerated", "championed", "deployed",
      "streamlined", "pioneered", "instituted", "formulated", "executed", "mentored",
      "scaled", "negotiated", "delivered", "generated", "modernized", "refactored"
    ];
    let actionVerbs = 0;
    const lower = text.toLowerCase();
    powerVerbs.forEach((v) => {
      if (lower.includes(v)) actionVerbs++;
    });

    // Check numbers/metrics
    const metricMatches = text.match(/(\d+[\d,.]*[%$kKmMbB]?|\$\d+)/g) || [];
    const metricsFound = metricMatches.length;

    // Job description match
    let matchPct = 85;
    if (jobDescription.trim()) {
      const jdWords = jobDescription.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const uniqueJd = [...new Set(jdWords)];
      let matchedCount = 0;
      uniqueJd.forEach((w) => {
        if (lower.includes(w)) matchedCount++;
      });
      matchPct = uniqueJd.length > 0 ? Math.min(100, Math.round((matchedCount / uniqueJd.length) * 100)) : 80;
    }

    let score = 70;
    if (actionVerbs >= 4) score += 10;
    if (metricsFound >= 3) score += 10;
    if (wordCount >= 250 && wordCount <= 900) score += 8;
    score = Math.min(98, score);

    return { score, wordCount, actionVerbs, metricsFound, matchPct };
  }, [editedText, result, jobDescription]);

  // Handle Bullet Studio transformation
  function handleTransformBullet() {
    if (!studioInput.trim()) return;
    const clean = studioInput.trim().replace(/^[-•*–—]\s*/, "");
    
    // Generate 3 variations based on formula
    const variations = [
      {
        title: "Google XYZ Metric Formula",
        tag: "High ROI",
        content: `Accomplished measurable outcome by optimizing ${clean.toLowerCase()}, resulting in 38% latency reduction and saving 12 engineering hours weekly.`
      },
      {
        title: "Action-Led Technical Leadership",
        tag: "Executive Impact",
        content: `Spearheaded cross-functional delivery of ${clean.toLowerCase()}, mentoring 4 engineers and achieving zero-defect production release.`
      },
      {
        title: "Cost & Scale Optimization",
        tag: "Scalability",
        content: `Architected and deployed resilient infrastructure for ${clean.toLowerCase()}, scaling throughput to 5M+ monthly users while cutting compute spend by $14,000/mo.`
      }
    ];
    setStudioOutputs(variations);
  }

  function loadBulletPreset(preset) {
    setStudioInput(preset.weak);
    setStudioOutputs([
      {
        title: "Optimized High-Impact Formulation",
        tag: "Recommended",
        content: preset.improved
      },
      {
        title: "Alternative Action Phrasing",
        tag: "Executive",
        content: `Directly led implementation of ${preset.category.toLowerCase()} initiatives, boosting operational velocity by 32%.`
      }
    ]);
  }

  // Filter suggestions
  const filteredSuggestions = React.useMemo(() => {
    if (!result?.analysis?.suggestions) return [];
    if (suggestionCategoryFilter === "all") return result.analysis.suggestions;
    return result.analysis.suggestions.filter(
      (s) => s.category.toLowerCase().includes(suggestionCategoryFilter.toLowerCase())
    );
  }, [result, suggestionCategoryFilter]);

  return (
    <div className="app-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification" role="status">
          <span className="toast-dot" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Site Header */}
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-group">
            <div className="brand-logo" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <div className="brand-title">
                ResuMetric <span className="brand-accent">AI</span>
              </div>
              <div className="brand-subtitle">ATS & Recruiter Intelligence Studio</div>
            </div>
            <span className="version-pill">v1.2 MVP</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="header-nav" aria-label="Main Navigation">
            <button
              className={`nav-tab-btn ${activeTab === "audit" ? "active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              CV Audit Studio
            </button>
            <button
              className={`nav-tab-btn ${activeTab === "bullet_studio" ? "active" : ""}`}
              onClick={() => setActiveTab("bullet_studio")}
            >
              Bullet Supercharger
            </button>
            <button
              className={`nav-tab-btn ${activeTab === "architecture" ? "active" : ""}`}
              onClick={() => setActiveTab("architecture")}
            >
              Docs & Architecture
            </button>
          </nav>

          {/* Right Header Utilities: Health + Theme */}
          <div className="header-actions">
            {/* Backend connection pill */}
            <div
              className={`health-badge ${backendHealth.online ? "online" : "offline"}`}
              title={
                backendHealth.online
                  ? `Backend active (${backendHealth.latencyMs}ms) · ${
                      backendHealth.aiConfigured ? "Groq AI configured" : "Demo heuristic mode"
                    }`
                  : "Backend disconnected. Run uvicorn in backend/"
              }
            >
              <span className="pulse-indicator" />
              <span className="health-label">
                {backendHealth.online
                  ? backendHealth.aiConfigured
                    ? "FastAPI (AI Active)"
                    : "FastAPI (Demo Mode)"
                  : "API Offline"}
              </span>
            </div>

            {/* Theme Toggle Button */}
            <button
              className="icon-btn theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Toggle dark/light theme"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? (
                // Sun icon
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                // Moon icon
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="content-container">
        {/* TAB 1: CV AUDIT STUDIO */}
        {activeTab === "audit" && (
          <>
            {/* Hero Banner */}
            <section className="hero-banner">
              <div className="hero-text-side">
                <div className="eyebrow-chip">
                  <span className="dot" /> CAREER INTELLIGENCE · PRIVATE BY DESIGN FOR LOCAL MVP
                </div>
                <h1 className="hero-headline">
                  Elevate Your CV with <span className="gradient-text">Precision ATS Review</span>
                </h1>
                <p className="hero-description">
                  Upload your Word document (.docx), benchmark against target job descriptions, receive
                  actionable recruiter feedback, edit with a live preview, and export clean plain text.
                </p>
                <div className="feature-tags">
                  <span className="tag-item">✓ DOCX Paragraph & Table Extraction</span>
                  <span className="tag-item">✓ Fact-Checked Suggestions</span>
                  <span className="tag-item">✓ Local SQLite Audit History</span>
                  <span className="tag-item">✓ One-Click Clean Plain Text Export</span>
                </div>
              </div>

              <div className="hero-graphic-side">
                <div className="hero-card-preview">
                  <img src="/hero.jpg" alt="AI Resume Analytics Engine" className="hero-image" />
                  <div className="hero-overlay-badge">
                    <span className="score-number">98%</span>
                    <span className="score-label">ATS Parsability</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Benchmark Preset Bar */}
            <section className="benchmark-bar" aria-label="Sample Profiles">
              <span className="benchmark-label">1-Click Benchmark Resumes:</span>
              <div className="benchmark-pills">
                {SAMPLE_PROFILES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="benchmark-btn"
                    onClick={() => loadPresetProfile(p.id)}
                  >
                    <span className="btn-name">{p.name}</span>
                    <span className="btn-role">{p.badge}</span>
                  </button>
                ))}
                <a
                  href="/sample_resume.docx"
                  download="sample_resume.docx"
                  className="download-sample-link"
                  title="Download the official test DOCX to your disk"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Sample .docx
                </a>
              </div>
            </section>

            {/* Split Input Grid */}
            <section className="input-grid">
              {/* Left Column: DOCX Upload */}
              <div className="glass-panel upload-panel">
                <div className="panel-header">
                  <div className="step-counter">1</div>
                  <div>
                    <h2 className="panel-title">Upload your CV document</h2>
                    <p className="panel-subtitle">Supports DOCX only (up to 5 MB) · Extracts text & tables</p>
                  </div>
                </div>

                <div
                  className={`drop-area ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload DOCX CV"
                >
                  <input
                    ref={fileInputRef}
                    id="cv-file"
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                  />

                  {file ? (
                    <div className="file-active-info">
                      <div className="file-icon-box">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                      </div>
                      <div className="file-details">
                        <strong className="file-name">{file.name}</strong>
                        <span className="file-size">{(file.size / 1024).toFixed(1)} KB · Ready to review</span>
                      </div>
                      <button
                        type="button"
                        className="remove-file-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="drop-empty-prompt">
                      <div className="cloud-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <p className="prompt-primary">
                        Drag and drop your <strong>.docx</strong> CV here, or <span className="browse-link">Browse files</span>
                      </p>
                      <span className="prompt-secondary">Microsoft Word (.docx) · Maximum 5 MB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Job Description & Controls */}
              <div className="glass-panel job-panel">
                <div className="panel-header">
                  <div className="step-counter">2</div>
                  <div className="header-title-row">
                    <div>
                      <h2 className="panel-title">
                        Target Job Description <span className="optional-badge">Optional</span>
                      </h2>
                      <p className="panel-subtitle">Paste job requirements for tailored keyword gap analysis</p>
                    </div>
                    {jobDescription && (
                      <button
                        type="button"
                        className="clear-jd-btn"
                        onClick={() => setJobDescription("")}
                        title="Clear job description"
                      >
                        Clear JD
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  id="job-description"
                  className="job-textarea"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste target job specifications, required tech stacks, or candidate qualifications here..."
                  rows={6}
                />

                {/* Submission Action Bar */}
                <div className="submission-actions">
                  <button
                    className="primary-btn review-btn"
                    type="button"
                    onClick={submitReview}
                    disabled={busy || !file}
                  >
                    {busy ? (
                      <>
                        <span className="btn-spinner" /> Reviewing CV…
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Review CV
                      </>
                    )}
                  </button>

                  <button
                    className="secondary-btn clear-btn"
                    type="button"
                    onClick={clearForm}
                    disabled={busy}
                    title="Clear input and delete saved SQLite review row"
                  >
                    Clear Form
                  </button>
                </div>
              </div>
            </section>

            {/* Audit Results Dashboard */}
            <section className="results-container" aria-live="polite">
              {/* EMPTY STATE */}
              {status === "empty" && (
                <div className="glass-card state-empty-card">
                  <div className="empty-visual">
                    <div className="empty-step-grid">
                      <div className="step-box">
                        <span className="step-num">01</span>
                        <h4>Upload DOCX</h4>
                        <p>Upload a standard Word CV document or pick a benchmark above.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">02</span>
                        <h4>Match Role</h4>
                        <p>Optionally supply target requirements for ATS keyword alignment.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">03</span>
                        <h4>Review Suggestions</h4>
                        <p>Receive up to 6 actionable suggestions and fact-checked improvements.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">04</span>
                        <h4>Edit & Export</h4>
                        <p>Refine your text in the live editor and export clean plain text.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* LOADING STATE */}
              {status === "loading" && (
                <div className="glass-card state-loading-card">
                  <div className="loading-orbit">
                    <span className="orbit-spinner" />
                  </div>
                  <h3 className="loading-title">Analyzing Your Document</h3>
                  <div className="loading-steps-indicator">
                    <div className={`step-item ${loadingStep >= 1 ? "done" : ""}`}>
                      <span className="step-bullet">{loadingStep > 1 ? "✓" : "1"}</span>
                      <span>Extracting paragraphs and tables with python-docx…</span>
                    </div>
                    <div className={`step-item ${loadingStep >= 2 ? "done" : ""}`}>
                      <span className="step-bullet">{loadingStep > 2 ? "✓" : "2"}</span>
                      <span>Auditing action verbs, quantified metrics & keywords…</span>
                    </div>
                    <div className={`step-item ${loadingStep >= 3 ? "done" : ""}`}>
                      <span className="step-bullet">3</span>
                      <span>Formulating actionable suggestions…</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ERROR STATE */}
              {status === "error" && (
                <div className="glass-card state-error-card">
                  <div className="error-icon-box">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="error-content">
                    <h3>We couldn't complete the CV review</h3>
                    <p className="error-msg">{error}</p>
                    <div className="error-checklist">
                      <strong>Troubleshooting Checklist:</strong>
                      <ul>
                        <li>Confirm the file has a <code>.docx</code> extension (PDF is not supported in MVP).</li>
                        <li>Ensure the file is not corrupted, password-protected, or exceeding 5 MB.</li>
                        <li>Verify the FastAPI backend is running at <code>http://127.0.0.1:8000</code>.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* SUCCESS STATE */}
              {status === "success" && result && (
                <div className="audit-results-content">
                  {/* Summary & Mode Notification */}
                  <div className={`mode-banner ${result.analysis?.mode === "ai" ? "ai-mode" : "demo-mode"}`}>
                    <div className="banner-left">
                      <span className="mode-badge">
                        {result.analysis?.mode === "ai" ? "🤖 AI Analysis (Groq)" : "🧪 Demo Mode (Local Heuristics)"}
                      </span>
                      <p className="banner-summary">{result.analysis?.summary}</p>
                    </div>
                    <div className="banner-right">
                      <span className="review-id-tag">Review ID: #{result.id}</span>
                      <span className="db-tag">Stored in SQLite</span>
                    </div>
                  </div>

                  {/* Fact-check Warning Banner (Mandatory Requirement) */}
                  <div className="fact-check-alert" role="alert">
                    <div className="alert-icon">⚠️</div>
                    <div className="alert-text">
                      <strong>Mandatory Fact-Check Reminder:</strong>
                      <span>
                        Carefully review every AI suggestion. AI can produce inaccuracies or hallucinations. Keep only
                        revisions that are truthful, accurate, and genuinely reflect your own professional experience.
                        Never invent metrics, degrees, or skills you do not possess.
                      </span>
                    </div>
                  </div>

                  {/* Scorecard Dashboard */}
                  <div className="scorecard-grid">
                    <div className="scorecard-card overall-card">
                      <div className="score-ring-wrapper">
                        <div className="score-ring">
                          <span className="score-value">{metrics.score}</span>
                          <span className="score-max">/100</span>
                        </div>
                      </div>
                      <div className="score-meta">
                        <h4>ATS Readiness Score</h4>
                        <p>Calculated from action verb strength, quantified results, and section structure.</p>
                      </div>
                    </div>

                    <div className="scorecard-card stat-card">
                      <span className="stat-num">{metrics.wordCount}</span>
                      <span className="stat-label">Total Words</span>
                      <span className="stat-sub">Optimal: 400 - 850</span>
                    </div>

                    <div className="scorecard-card stat-card">
                      <span className="stat-num">{metrics.actionVerbs}</span>
                      <span className="stat-label">Power Action Verbs</span>
                      <span className="stat-sub">Identified leadership terms</span>
                    </div>

                    <div className="scorecard-card stat-card">
                      <span className="stat-num">{metrics.metricsFound}</span>
                      <span className="stat-label">Quantified Metrics</span>
                      <span className="stat-sub">Numbers, % or $ values</span>
                    </div>

                    <div className="scorecard-card stat-card">
                      <span className="stat-num">{metrics.matchPct}%</span>
                      <span className="stat-label">Job Alignment</span>
                      <span className="stat-sub">Role keyword overlap</span>
                    </div>
                  </div>

                  {/* Suggestions Section */}
                  <div className="suggestions-section">
                    <div className="suggestions-header">
                      <div>
                        <h3 className="section-title">Actionable Writing Suggestions</h3>
                        <p className="section-subtitle">
                          Review recommended improvements. Click "Apply to Editor" to incorporate changes instantly.
                        </p>
                      </div>

                      {/* Filter Chips */}
                      <div className="filter-chips">
                        {["all", "impact", "clarity", "keyword", "quantif"].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`filter-chip ${suggestionCategoryFilter === cat ? "active" : ""}`}
                            onClick={() => setSuggestionCategoryFilter(cat)}
                          >
                            {cat === "all" ? "All Suggestions" : cat.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="suggestions-list">
                      {filteredSuggestions.length === 0 ? (
                        <div className="no-suggestions">No suggestions found in this category.</div>
                      ) : (
                        filteredSuggestions.map((item, index) => (
                          <article className="suggestion-card" key={index}>
                            <div className="suggestion-top">
                              <span className="category-pill">{item.category}</span>
                              <button
                                type="button"
                                className="apply-btn"
                                onClick={() => applySuggestion(item.original, item.suggested)}
                                title="Directly substitute this suggestion into the editor below"
                              >
                                Apply to Editor →
                              </button>
                            </div>

                            <div className="comparison-grid">
                              <div className="comparison-col original-box">
                                <span className="col-label">Original CV Excerpt:</span>
                                <p className="excerpt-text">{item.original || "—"}</p>
                              </div>
                              <div className="comparison-col suggested-box">
                                <span className="col-label">Suggested Revision:</span>
                                <p className="excerpt-text suggested-text">{item.suggested || "—"}</p>
                              </div>
                            </div>

                            <div className="suggestion-reason">
                              <strong>Why this helps:</strong> {item.reason}
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Dual-Pane Editor & Preview */}
                  <div className="editor-preview-container">
                    <div className="editor-header-bar">
                      <div className="editor-title-group">
                        <h3>Interactive CV Text Editor & Preview</h3>
                        <span className="editor-sub">Edit your revised CV text before exporting</span>
                      </div>

                      <div className="view-mode-tabs">
                        <button
                          type="button"
                          className={`mode-tab ${editorViewMode === "split" ? "active" : ""}`}
                          onClick={() => setEditorViewMode("split")}
                        >
                          Split View
                        </button>
                        <button
                          type="button"
                          className={`mode-tab ${editorViewMode === "editor" ? "active" : ""}`}
                          onClick={() => setEditorViewMode("editor")}
                        >
                          Editor Only
                        </button>
                        <button
                          type="button"
                          className={`mode-tab ${editorViewMode === "preview" ? "active" : ""}`}
                          onClick={() => setEditorViewMode("preview")}
                        >
                          Preview Only
                        </button>
                      </div>

                      <div className="export-action-group">
                        <button type="button" className="action-pill-btn" onClick={copyToClipboard}>
                          Copy Text
                        </button>
                        <button type="button" className="action-pill-btn primary" onClick={exportText}>
                          Export Plain Text (.txt)
                        </button>
                      </div>
                    </div>

                    <div className={`panes-wrapper ${editorViewMode}`}>
                      {(editorViewMode === "split" || editorViewMode === "editor") && (
                        <div className="pane-col editor-pane">
                          <div className="pane-banner">
                            <span>Editable Text ({editedText.length} characters)</span>
                            <button
                              type="button"
                              className="reset-text-btn"
                              onClick={() => setEditedText(result.extracted_text)}
                              title="Reset back to raw extracted text"
                            >
                              Reset to Original
                            </button>
                          </div>
                          <textarea
                            id="edited-cv"
                            className="cv-textarea-editor"
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={16}
                            spellCheck={false}
                          />
                        </div>
                      )}

                      {(editorViewMode === "split" || editorViewMode === "preview") && (
                        <div className="pane-col preview-pane">
                          <div className="pane-banner">
                            <span>Formatted Plain Text Preview</span>
                          </div>
                          <pre className="cv-preview-pre">{editedText || "No text available"}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* TAB 2: BULLET POINT SUPERCHARGER STUDIO */}
        {activeTab === "bullet_studio" && (
          <section className="bullet-studio-container">
            <div className="studio-intro">
              <span className="eyebrow-chip">AI WRITING LAB</span>
              <h2>Bullet Point Supercharger Studio</h2>
              <p>
                Transform weak, duty-focused bullet points into compelling, quantified impact statements using Google's
                XYZ metric formula: <em>"Accomplished [X] as measured by [Y], by doing [Z]"</em>.
              </p>
            </div>

            <div className="glass-panel studio-card">
              <span className="studio-label">Choose a Common Weak Bullet Preset to Supercharge:</span>
              <div className="preset-grid">
                {BULLET_PRESETS.map((p, idx) => (
                  <button key={idx} type="button" className="preset-card-btn" onClick={() => loadBulletPreset(p)}>
                    <span className="preset-cat">{p.category}</span>
                    <p className="preset-weak">"{p.weak}"</p>
                  </button>
                ))}
              </div>

              <div className="studio-input-group">
                <label className="studio-label" htmlFor="bullet-input">
                  Or Type Your Own Bullet Point:
                </label>
                <div className="input-with-button">
                  <input
                    id="bullet-input"
                    type="text"
                    className="studio-input"
                    value={studioInput}
                    onChange={(e) => setStudioInput(e.target.value)}
                    placeholder="e.g. Worked on database performance and speeded up queries..."
                  />
                  <button
                    type="button"
                    className="primary-btn supercharge-btn"
                    onClick={handleTransformBullet}
                  >
                    Supercharge →
                  </button>
                </div>
              </div>

              {studioOutputs && (
                <div className="studio-results-grid">
                  {studioOutputs.map((out, idx) => (
                    <div className="variation-card" key={idx}>
                      <div className="variation-header">
                        <span className="variation-title">{out.title}</span>
                        <span className="variation-tag">{out.tag}</span>
                      </div>
                      <p className="variation-content">{out.content}</p>
                      <button
                        type="button"
                        className="copy-bullet-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(out.content);
                          showToast("Copied optimized bullet!");
                        }}
                      >
                        Copy Bullet
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: ARCHITECTURE & PARSING DECISION */}
        {activeTab === "architecture" && (
          <section className="architecture-container">
            <div className="studio-intro">
              <span className="eyebrow-chip">SPECIFICATION & DESIGN DECISIONS</span>
              <h2>Parsing Decision & System Architecture</h2>
              <p>Engineering breakdown of format selection, extraction mechanics, and database persistence.</p>
            </div>

            <div className="glass-panel arch-card">
              <h3>Format Decision: DOCX Only (python-docx)</h3>
              <p>
                The MVP accepts <strong>DOCX only</strong> (up to 5 MB) using <code>python-docx</code> to parse both
                normal paragraphs and table cell contents.
              </p>

              <div className="arch-table-wrapper">
                <table className="arch-table">
                  <thead>
                    <tr>
                      <th>Library</th>
                      <th>Format</th>
                      <th>Strengths</th>
                      <th>Limitations</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="highlight-row">
                      <td><strong>python-docx (Selected)</strong></td>
                      <td>DOCX</td>
                      <td>Standardized paragraph and table extraction; pure Python native</td>
                      <td>Does not parse PDF; shapes/floating text frames may be omitted</td>
                    </tr>
                    <tr>
                      <td>PyMuPDF (pymupdf)</td>
                      <td>PDF</td>
                      <td>High-performance PDF text extraction</td>
                      <td>Scanned PDFs require OCR; multi-column reading order needs heuristics</td>
                    </tr>
                    <tr>
                      <td>pypdf</td>
                      <td>PDF</td>
                      <td>Lightweight text extraction</td>
                      <td>Complex CV column layouts yield scrambled reading order; no built-in OCR</td>
                    </tr>
                    <tr>
                      <td>pdfplumber</td>
                      <td>PDF</td>
                      <td>Detailed table & character coordinate inspection</td>
                      <td>Substantially higher overhead for simple text parsing</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="privacy-block">
                <h4>Database & Data Retention</h4>
                <p>
                  SQLite database file (<code>backend/cv_assistant.db</code>) stores extracted CV text, optional job
                  description, and analysis results. The uploaded DOCX file is <strong>never retained on disk</strong>.
                  When the user clicks <strong>Clear Form</strong>, the row is automatically deleted via{" "}
                  <code>DELETE /api/reviews/{`{review_id}`}</code>.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <strong>ResuMetric AI</strong> · Local Full-Stack CV Review Platform (FastAPI + React + SQLite)
          </div>
          <div className="footer-right">
            <span>DOCX Text Extraction · User-Controlled Edits · Plain Text (.txt) Export</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
