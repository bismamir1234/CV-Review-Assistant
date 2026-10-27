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
  const [targetRole, setTargetRole] = useState("");
  const [status, setStatus] = useState("empty"); // "empty" | "loading" | "success" | "error"
  const [loadingStep, setLoadingStep] = useState(1);
  const [loadingMessage, setLoadingMessage] = useState("Analyzing your document...");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [busyReview, setBusyReview] = useState(false);
  const [busyMatch, setBusyMatch] = useState(false);

  // Suggestions with individual state management (accept/reject/edit)
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionCategoryFilter, setSuggestionCategoryFilter] = useState("all");
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState("all");

  // Job matching result state
  const [jobMatch, setJobMatch] = useState(null);

  // UI views & tabs
  const [activeTab, setActiveTab] = useState("audit"); // "audit" | "bullet_studio" | "architecture"
  const [editorViewMode, setEditorViewMode] = useState("split"); // "split" | "editor" | "preview"
  const [toastMessage, setToastMessage] = useState("");

  // Bullet studio state
  const [studioInput, setStudioInput] = useState("");
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
      const response = await fetch("/sample_resume.docx");
      if (!response.ok) throw new Error("Could not fetch sample resume file");
      const blob = await response.blob();
      const sampleFile = new File([blob], `${profile.name.toLowerCase().replace(/\s+/g, "_")}_resume.docx`, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      setFile(sampleFile);
      setJobDescription(profile.jobPreset);
      setTargetRole(profile.role || "");
      setError("");
      setStatus("empty");
      showToast(`Loaded ${profile.name}'s profile & role requirements`);
    } catch {
      showToast(`Selected ${profile.name}. Please upload or review CV.`);
    }
  }

  // Feature 1: Submit CV for AI Review
  async function submitReview(event) {
    if (event) event.preventDefault();

    if (!file && !extractedText) {
      setError("Please select or drop a DOCX CV before submitting for review.");
      setStatus("error");
      return;
    }

    setBusyReview(true);
    setStatus("loading");
    setLoadingStep(1);
    setLoadingMessage("Extracting text and running AI writing review…");
    setError("");

    const progressTimer = setInterval(() => {
      setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 450);

    try {
      let dataResult = null;

      if (file) {
        const form = new FormData();
        form.append("cv_file", file);
        form.append("job_description", jobDescription);

        const response = await fetch(`${API}/api/reviews`, {
          method: "POST",
          body: form
        });
        const body = await response.json();
        clearInterval(progressTimer);

        if (!response.ok) {
          throw new Error(body.detail || "Review request failed.");
        }
        dataResult = body;
        setResult(body);
        setExtractedText(body.extracted_text || "");
        if (!editedText) setEditedText(body.extracted_text || "");

        // Initialize suggestions with state tracking
        const rawSuggs = body.analysis?.suggestions || [];
        setSuggestions(
          rawSuggs.map((s, idx) => ({
            ...s,
            id: s.id || `sugg-${idx + 1}`,
            status: s.status || "pending",
            isEditing: false,
            editText: s.suggested_rewrite || s.suggested || ""
          }))
        );

        if (body.analysis?.job_match) {
          setJobMatch(body.analysis.job_match);
        }
      } else {
        // Direct text review endpoint
        const response = await fetch(`${API}/api/cv/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cv_text: extractedText, target_role: targetRole || jobDescription.slice(0, 200) })
        });
        const body = await response.json();
        clearInterval(progressTimer);

        if (!response.ok) {
          throw new Error(body.detail || "CV Review failed.");
        }

        const rawSuggs = body.suggestions || [];
        setSuggestions(
          rawSuggs.map((s, idx) => ({
            ...s,
            id: s.id || `sugg-${idx + 1}`,
            status: "pending",
            isEditing: false,
            editText: s.suggested_rewrite || s.suggested || ""
          }))
        );
      }

      setStatus("success");
      showToast("CV Review completed successfully!");
    } catch (err) {
      clearInterval(progressTimer);
      setError(err.message || "Failed to complete CV Review. Check if FastAPI is running.");
      setStatus("error");
    } finally {
      setBusyReview(false);
    }
  }

  // Feature 2: Submit CV & Job Description for Matching
  async function submitJobMatch() {
    if (!jobDescription.trim()) {
      setError("Please paste a target job description to match your CV against.");
      setStatus("error");
      return;
    }

    const currentText = editedText || extractedText;
    if (!currentText && !file) {
      setError("Please upload a CV document first before matching against a job description.");
      setStatus("error");
      return;
    }

    setBusyMatch(true);
    setStatus("loading");
    setLoadingStep(2);
    setLoadingMessage("Comparing CV skills with job description requirements & keywords…");
    setError("");

    try {
      let textToMatch = currentText;
      // If text not yet extracted from file, run the unified review first
      if (!textToMatch && file) {
        const form = new FormData();
        form.append("cv_file", file);
        form.append("job_description", jobDescription);
        const resp = await fetch(`${API}/api/reviews`, { method: "POST", body: form });
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.detail || "Failed to process file.");
        setResult(body);
        setExtractedText(body.extracted_text || "");
        setEditedText(body.extracted_text || "");
        textToMatch = body.extracted_text;

        const rawSuggs = body.analysis?.suggestions || [];
        setSuggestions(
          rawSuggs.map((s, idx) => ({
            ...s,
            id: s.id || `sugg-${idx + 1}`,
            status: s.status || "pending",
            isEditing: false,
            editText: s.suggested_rewrite || s.suggested || ""
          }))
        );

        if (body.analysis?.job_match) {
          setJobMatch(body.analysis.job_match);
          setStatus("success");
          showToast("Job Matching analysis complete!");
          setBusyMatch(false);
          return;
        }
      }

      const matchResp = await fetch(`${API}/api/cv/match-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: textToMatch, job_description: jobDescription })
      });
      const matchData = await matchResp.json();
      if (!matchResp.ok) throw new Error(matchData.detail || "Job matching failed.");

      setJobMatch(matchData);
      setStatus("success");
      showToast("Job Matching analysis complete!");
    } catch (err) {
      setError(err.message || "Failed to execute Job Matching.");
      setStatus("error");
    } finally {
      setBusyMatch(false);
    }
  }

  // Clear form & delete SQLite record
  async function clearForm() {
    if (result?.id) {
      try {
        await fetch(`${API}/api/reviews/${result.id}`, { method: "DELETE" });
        showToast("Review record deleted from database.");
      } catch {
        // UI still resets
      }
    }
    setFile(null);
    setJobDescription("");
    setTargetRole("");
    setResult(null);
    setExtractedText("");
    setEditedText("");
    setSuggestions([]);
    setJobMatch(null);
    setError("");
    setStatus("empty");
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Form cleared.");
  }

  // Individual Suggestion Controls: Accept
  function handleAcceptSuggestion(id) {
    const sugg = suggestions.find((s) => s.id === id);
    if (!sugg) return;

    const orig = sugg.original_statement;
    const rewrite = sugg.suggested_rewrite;

    if (orig && rewrite) {
      if (editedText.includes(orig)) {
        setEditedText((prev) => prev.replace(orig, rewrite));
      } else {
        setEditedText((prev) => `${prev}\n\n[Applied Revision]: ${rewrite}`);
      }
    }

    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "accepted", isEditing: false } : s))
    );
    showToast(`Accepted suggestion #${id} and updated draft!`);
  }

  // Individual Suggestion Controls: Reject
  function handleRejectSuggestion(id) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "rejected", isEditing: false } : s))
    );
    showToast(`Rejected suggestion #${id}. Original CV text left unchanged.`);
  }

  // Individual Suggestion Controls: Start Edit
  function handleStartEdit(id) {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, isEditing: true, editText: s.suggested_rewrite }
          : { ...s, isEditing: false }
      )
    );
  }

  // Individual Suggestion Controls: Save Custom Edit
  function handleSaveCustomEdit(id) {
    const sugg = suggestions.find((s) => s.id === id);
    if (!sugg) return;

    const customText = sugg.editText.trim();
    if (!customText) {
      showToast("Edit text cannot be empty.");
      return;
    }

    const orig = sugg.original_statement;
    if (orig && editedText.includes(orig)) {
      setEditedText((prev) => prev.replace(orig, customText));
    } else {
      setEditedText((prev) => `${prev}\n\n[Custom Revision]: ${customText}`);
    }

    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, suggested_rewrite: customText, status: "edited", isEditing: false }
          : s
      )
    );
    showToast(`Applied custom edit for suggestion #${id}!`);
  }

  // Individual Suggestion Controls: Cancel Edit
  function handleCancelEdit(id) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isEditing: false } : s))
    );
  }

  // Export plain text
  function exportText() {
    const textToExport = editedText || extractedText || "";
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

  // Filter suggestions
  const filteredSuggestions = React.useMemo(() => {
    return suggestions.filter((s) => {
      const matchCat =
        suggestionCategoryFilter === "all" ||
        s.category.toLowerCase().includes(suggestionCategoryFilter.toLowerCase());
      const matchStat =
        suggestionStatusFilter === "all" || s.status === suggestionStatusFilter;
      return matchCat && matchStat;
    });
  }, [suggestions, suggestionCategoryFilter, suggestionStatusFilter]);

  // Handle Bullet Studio transformation
  function handleTransformBullet() {
    if (!studioInput.trim()) return;
    const clean = studioInput.trim().replace(/^[-•*–—]\s*/, "");

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

  const busy = busyReview || busyMatch;

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
              <div className="brand-subtitle">AI CV Review & Job Matching Studio</div>
            </div>
            <span className="version-pill">v1.3 Pro</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="header-nav" aria-label="Main Navigation">
            <button
              className={`nav-tab-btn ${activeTab === "audit" ? "active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              CV Audit & Job Match
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
                    ? "FastAPI (Groq AI Active)"
                    : "FastAPI (Demo Heuristics)"
                  : "API Offline"}
              </span>
            </div>

            <button
              className="icon-btn theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Toggle dark/light theme"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? (
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
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {activeTab === "audit" && (
          <>
            {/* Top Workspace Form Section */}
            <section className="form-workspace-grid">
              {/* Left Column: File Upload */}
              <div className="glass-panel upload-panel">
                <div className="panel-header">
                  <div className="step-counter">1</div>
                  <div>
                    <h2 className="panel-title">Upload CV Document</h2>
                    <p className="panel-subtitle">Upload your current resume in Microsoft Word (.docx) format</p>
                  </div>
                </div>

                {/* Sample Profile Benchmark Chips */}
                <div className="preset-bar">
                  <span className="preset-label">Test with Benchmark Profiles:</span>
                  <div className="preset-chips">
                    {SAMPLE_PROFILES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="preset-chip-btn"
                        onClick={() => loadPresetProfile(p.id)}
                        title={`Load ${p.name}'s sample DOCX CV`}
                      >
                        {p.role}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Drag-and-Drop Zone */}
                <div
                  className={`drop-zone ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload DOCX CV file"
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
                        <span className="file-size">{(file.size / 1024).toFixed(1)} KB · Ready for analysis</span>
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

                {/* Target Role input */}
                <div style={{ marginTop: "16px" }}>
                  <label className="input-field-label" htmlFor="target-role-input">
                    Target Job Title / Domain (Optional):
                  </label>
                  <input
                    id="target-role-input"
                    type="text"
                    className="studio-input"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Senior Fullstack Engineer / Cloud Architect"
                  />
                </div>
              </div>

              {/* Right Column: Job Description & Controls */}
              <div className="glass-panel job-panel">
                <div className="panel-header">
                  <div className="step-counter">2</div>
                  <div className="header-title-row">
                    <div>
                      <h2 className="panel-title">
                        Target Job Description <span className="optional-badge">Optional for Review, Required for Match</span>
                      </h2>
                      <p className="panel-subtitle">Paste target role specifications for deep skill and keyword matching</p>
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
                  placeholder="Paste target job specifications, required technical stacks, or candidate qualifications here..."
                  rows={6}
                />

                {/* Submission Action Bar: Separate Review CV and Match Job buttons */}
                <div className="submission-actions">
                  <button
                    className="primary-btn review-btn"
                    type="button"
                    onClick={submitReview}
                    disabled={busy || (!file && !extractedText)}
                    title="Review grammar, clarity, professional tone, and action verbs"
                  >
                    {busyReview ? (
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
                    className="secondary-btn match-btn"
                    type="button"
                    onClick={submitJobMatch}
                    disabled={busy || !jobDescription.trim() || (!file && !extractedText)}
                    title="Compare CV skills and experience against the target job requirements"
                  >
                    {busyMatch ? (
                      <>
                        <span className="btn-spinner" /> Matching Job…
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        Match Job
                      </>
                    )}
                  </button>

                  <button
                    className="secondary-btn clear-btn"
                    type="button"
                    onClick={clearForm}
                    disabled={busy}
                    title="Clear input and delete saved review record"
                  >
                    Clear Form
                  </button>
                </div>
              </div>
            </section>

            {/* Results Section */}
            <section className="results-container" aria-live="polite">
              {/* EMPTY STATE */}
              {status === "empty" && (
                <div className="glass-card state-empty-card">
                  <div className="empty-visual">
                    <div className="empty-step-grid">
                      <div className="step-box">
                        <span className="step-num">01</span>
                        <h4>Upload DOCX</h4>
                        <p>Upload a standard Word CV document or pick a benchmark profile above.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">02</span>
                        <h4>Paste Job Specs</h4>
                        <p>Optionally supply target requirements for skill and keyword gap analysis.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">03</span>
                        <h4>AI Review & Match</h4>
                        <p>Review suggestions with accept/reject/edit controls and matched skills.</p>
                      </div>
                      <div className="step-box">
                        <span className="step-num">04</span>
                        <h4>Edit & Export</h4>
                        <p>Refine your text in the live editor and export clean plain text (.txt).</p>
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
                  <h3 className="loading-title">{loadingMessage}</h3>
                  <div className="loading-steps-indicator">
                    <div className={`step-item ${loadingStep >= 1 ? "done" : ""}`}>
                      <span className="step-bullet">{loadingStep > 1 ? "✓" : "1"}</span>
                      <span>Extracting paragraphs and tables with python-docx…</span>
                    </div>
                    <div className={`step-item ${loadingStep >= 2 ? "done" : ""}`}>
                      <span className="step-bullet">{loadingStep > 2 ? "✓" : "2"}</span>
                      <span>Auditing action verbs, clarity, grammar & keywords…</span>
                    </div>
                    <div className={`step-item ${loadingStep >= 3 ? "done" : ""}`}>
                      <span className="step-bullet">3</span>
                      <span>Formulating actionable suggestions & gap analysis…</span>
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
                    <h3>Action Could Not Be Completed</h3>
                    <p className="error-msg">{error}</p>
                    <div className="error-checklist">
                      <strong>Troubleshooting Checklist:</strong>
                      <ul>
                        <li>Confirm the file has a <code>.docx</code> extension (PDF not supported in MVP).</li>
                        <li>Ensure the file is not corrupted, password-protected, or exceeding 5 MB.</li>
                        <li>Verify the FastAPI backend is running at <code>http://127.0.0.1:8000</code>.</li>
                        <li>For Job Matching, ensure both CV text and Job Description are supplied.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* SUCCESS STATE */}
              {status === "success" && (
                <div className="audit-results-content">
                  {/* Mandatory Review-Before-Use Warning Banner */}
                  <div className="fact-check-alert" role="alert">
                    <div className="alert-icon">⚠️</div>
                    <div className="alert-text">
                      <strong>Review Before Use Warning:</strong>
                      <p style={{ marginTop: "4px", fontSize: "0.95rem" }}>
                        "AI-generated suggestions may contain errors. Verify every statement, skill, qualification,
                        date, and achievement before using it in your CV. Only include claims that accurately reflect
                        your real experience."
                      </p>
                    </div>
                  </div>

                  {/* Summary & Mode Notification */}
                  <div className={`mode-banner ${result?.analysis?.mode === "ai" || jobMatch?.mode === "ai" ? "ai-mode" : "demo-mode"}`}>
                    <div className="banner-left">
                      <span className="mode-badge">
                        {result?.analysis?.mode === "ai" || jobMatch?.mode === "ai"
                          ? "🤖 AI Analysis (Groq LLM Active)"
                          : "🧪 Demo Mode (Local Heuristics Active)"}
                      </span>
                      <p className="banner-summary">
                        {result?.analysis?.summary || jobMatch?.evidence_summary || "Review the suggestions and match analysis below."}
                      </p>
                    </div>
                    {result?.id && (
                      <div className="banner-right">
                        <span className="review-id-tag">Review ID: #{result.id}</span>
                        <span className="db-tag">Stored in SQLite</span>
                      </div>
                    )}
                  </div>

                  {/* FEATURE 2: JOB MATCHING RESULTS SECTION */}
                  {jobMatch && (
                    <div className="job-match-section glass-panel" style={{ marginTop: "24px", padding: "24px" }}>
                      <div className="job-match-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span className="eyebrow-chip" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
                              FEATURE 2: JOB MATCHING
                            </span>
                            <h3 className="section-title" style={{ margin: 0 }}>CV & Job Description Alignment</h3>
                          </div>
                          <p className="section-subtitle" style={{ marginTop: "6px" }}>
                            Comparison of your CV against target role specifications, required skills, and keyword gaps.
                          </p>
                        </div>

                        {/* Coverage Score Card */}
                        <div className="score-coverage-card" style={{ background: "var(--input-bg)", padding: "14px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", textAlign: "center", minWidth: "220px" }}>
                          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--primary)" }}>
                            {jobMatch.matching_score}%
                          </div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                            Requirement Coverage Score
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px", lineHeight: "1.3" }}>
                            {jobMatch.score_explanation}
                          </div>
                        </div>
                      </div>

                      <div className="job-match-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                        {/* 1. Matched Skills with Evidence */}
                        <div className="match-card" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-md)", padding: "18px" }}>
                          <h4 style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <span>✓</span> Matched Skills & Requirements ({jobMatch.matched_skills?.length || 0})
                          </h4>
                          {jobMatch.matched_skills?.length === 0 ? (
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No direct keyword matches found.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                              {jobMatch.matched_skills.map((m, idx) => (
                                <div key={idx} style={{ background: "var(--bg-card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                  <strong style={{ color: "var(--text-main)", display: "block" }}>{m.skill}</strong>
                                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                    Evidence from CV: "{m.evidence}"
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Possible Gaps (Not Evidenced in CV) */}
                        <div className="match-card" style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "var(--radius-md)", padding: "18px" }}>
                          <h4 style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                            <span>✕</span> Possible Gaps (Not Evidenced in CV)
                          </h4>
                          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "12px", lineHeight: "1.4" }}>
                            *These requirements were not found in your provided CV text. This does not imply you lack the ability; ensure you mention them if you possess genuine experience.
                          </p>
                          {jobMatch.possible_gaps?.length === 0 ? (
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No critical gaps identified.</p>
                          ) : (
                            <ul style={{ paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              {jobMatch.possible_gaps.map((gap, idx) => (
                                <li key={idx} style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* 3. Keywords: Supported vs Requiring Verification */}
                      <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                        <div style={{ background: "var(--bg-card)", padding: "14px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                          <h5 style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "10px" }}>
                            Keywords Supported by CV Experience:
                          </h5>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {jobMatch.supported_keywords?.map((kw, idx) => (
                              <span key={idx} className="filter-chip active" style={{ fontSize: "0.8rem", background: "rgba(16, 185, 129, 0.15)", color: "var(--success)", borderColor: "var(--success)" }}>
                                ✓ {kw}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ background: "var(--bg-card)", padding: "14px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                          <h5 style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "10px" }}>
                            Keywords Requiring Verification Before Use:
                          </h5>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {jobMatch.verification_keywords?.map((kw, idx) => (
                              <span key={idx} className="filter-chip" style={{ fontSize: "0.8rem", background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)", borderColor: "var(--warning)" }}>
                                ⚠️ {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 4. Recommendations & Uncertain Matches */}
                      {jobMatch.recommendations?.length > 0 && (
                        <div style={{ marginTop: "20px", background: "var(--bg-card)", padding: "16px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                          <h5 style={{ fontSize: "0.95rem", color: "var(--primary)", marginBottom: "8px" }}>
                            💡 Honest Recommendations for this Role:
                          </h5>
                          <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                            {jobMatch.recommendations.map((rec, idx) => (
                              <li key={idx} style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* FEATURE 1: AI SUGGESTIONS SECTION WITH INDIVIDUAL CONTROLS */}
                  <div className="suggestions-section" style={{ marginTop: "32px" }}>
                    <div className="suggestions-header">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="eyebrow-chip" style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--primary)" }}>
                            FEATURE 1: AI SUGGESTIONS
                          </span>
                          <h3 className="section-title" style={{ margin: 0 }}>Actionable Writing & Impact Improvements</h3>
                        </div>
                        <p className="section-subtitle" style={{ marginTop: "6px" }}>
                          Review each recommendation individually. Accept, reject, or edit proposals before incorporating them into your CV.
                        </p>
                      </div>

                      {/* Status and Category Filter Controls */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                        <div className="filter-chips">
                          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)", alignSelf: "center", marginRight: "4px" }}>Filter:</span>
                          {["all", "pending", "accepted", "rejected", "edited"].map((stat) => (
                            <button
                              key={stat}
                              type="button"
                              className={`filter-chip ${suggestionStatusFilter === stat ? "active" : ""}`}
                              onClick={() => setSuggestionStatusFilter(stat)}
                            >
                              {stat === "all" ? "All Statuses" : stat.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="suggestions-list" style={{ marginTop: "16px" }}>
                      {filteredSuggestions.length === 0 ? (
                        <div className="no-suggestions" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                          No suggestions found matching the current filter.
                        </div>
                      ) : (
                        filteredSuggestions.map((item) => (
                          <article
                            className={`suggestion-card status-${item.status}`}
                            key={item.id}
                            style={{
                              borderLeft: `4px solid ${
                                item.status === "accepted"
                                  ? "var(--success)"
                                  : item.status === "rejected"
                                  ? "var(--danger)"
                                  : item.status === "edited"
                                  ? "var(--accent-sky)"
                                  : "var(--primary)"
                              }`
                            }}
                          >
                            <div className="suggestion-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span className="category-pill">{item.category}</span>
                                <span
                                  className={`status-pill pill-${item.status}`}
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "3px 10px",
                                    borderRadius: "var(--radius-full)",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    background:
                                      item.status === "accepted"
                                        ? "rgba(16, 185, 129, 0.2)"
                                        : item.status === "rejected"
                                        ? "rgba(239, 68, 68, 0.2)"
                                        : item.status === "edited"
                                        ? "rgba(56, 189, 248, 0.2)"
                                        : "rgba(245, 158, 11, 0.2)",
                                    color:
                                      item.status === "accepted"
                                        ? "var(--success)"
                                        : item.status === "rejected"
                                        ? "var(--danger)"
                                        : item.status === "edited"
                                        ? "var(--accent-sky)"
                                        : "var(--warning)"
                                  }}
                                >
                                  {item.status}
                                </span>
                              </div>

                              {/* Individual User Controls: Accept, Reject, Edit */}
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  className="action-control-btn accept-btn"
                                  onClick={() => handleAcceptSuggestion(item.id)}
                                  disabled={item.status === "accepted"}
                                  title="Accept this suggestion and apply it into your CV editor draft"
                                  style={{
                                    background: "rgba(16, 185, 129, 0.15)",
                                    color: "var(--success)",
                                    border: "1px solid rgba(16, 185, 129, 0.4)",
                                    padding: "6px 14px",
                                    borderRadius: "var(--radius-sm)",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontSize: "0.85rem"
                                  }}
                                >
                                  ✓ Accept
                                </button>

                                <button
                                  type="button"
                                  className="action-control-btn reject-btn"
                                  onClick={() => handleRejectSuggestion(item.id)}
                                  disabled={item.status === "rejected"}
                                  title="Reject this suggestion and keep your original statement"
                                  style={{
                                    background: "rgba(239, 68, 68, 0.12)",
                                    color: "var(--danger)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    padding: "6px 14px",
                                    borderRadius: "var(--radius-sm)",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontSize: "0.85rem"
                                  }}
                                >
                                  ✕ Reject
                                </button>

                                <button
                                  type="button"
                                  className="action-control-btn edit-btn"
                                  onClick={() => handleStartEdit(item.id)}
                                  title="Customize this proposed rewrite before accepting"
                                  style={{
                                    background: "rgba(99, 102, 241, 0.12)",
                                    color: "var(--primary)",
                                    border: "1px solid rgba(99, 102, 241, 0.3)",
                                    padding: "6px 14px",
                                    borderRadius: "var(--radius-sm)",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontSize: "0.85rem"
                                  }}
                                >
                                  ✎ Edit
                                </button>
                              </div>
                            </div>

                            {/* Issue Identified */}
                            {item.issue_identified && (
                              <div style={{ marginTop: "12px", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                                <strong style={{ color: "var(--text-main)" }}>Issue Identified:</strong> {item.issue_identified}
                              </div>
                            )}

                            {/* Side-by-Side Wording Comparison */}
                            <div className="comparison-grid" style={{ marginTop: "12px" }}>
                              <div className="comparison-col original-box">
                                <span className="col-label">Original CV Statement:</span>
                                <p className="excerpt-text">{item.original_statement || item.original || "—"}</p>
                              </div>
                              <div className="comparison-col suggested-box">
                                <span className="col-label">Suggested Revision:</span>
                                {item.isEditing ? (
                                  <div style={{ marginTop: "6px" }}>
                                    <textarea
                                      className="cv-textarea-editor"
                                      value={item.editText}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSuggestions((prev) =>
                                          prev.map((s) => (s.id === item.id ? { ...s, editText: val } : s))
                                        );
                                      }}
                                      rows={4}
                                      style={{ width: "100%", padding: "8px", fontSize: "0.9rem" }}
                                    />
                                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                                        onClick={() => handleSaveCustomEdit(item.id)}
                                      >
                                        Save & Apply Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary-btn"
                                        style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                                        onClick={() => handleCancelEdit(item.id)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="excerpt-text suggested-text">{item.suggested_rewrite || item.suggested || "—"}</p>
                                )}
                              </div>
                            </div>

                            {/* Facts to Verify Banner inside each suggestion */}
                            {item.facts_to_verify && (
                              <div
                                className="verify-facts-box"
                                style={{
                                  marginTop: "12px",
                                  padding: "10px 14px",
                                  background: "rgba(245, 158, 11, 0.08)",
                                  borderLeft: "3px solid var(--warning)",
                                  borderRadius: "4px",
                                  fontSize: "0.85rem"
                                }}
                              >
                                <strong style={{ color: "var(--warning)" }}>🔍 Facts to Verify:</strong>{" "}
                                <span style={{ color: "var(--text-muted)" }}>{item.facts_to_verify}</span>
                              </div>
                            )}

                            {/* Explanation */}
                            <div className="suggestion-reason" style={{ marginTop: "10px" }}>
                              <strong>Why this helps:</strong> {item.explanation || item.reason}
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Dual-Pane Editor & Preview */}
                  <div className="editor-preview-container" style={{ marginTop: "32px" }}>
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
                              onClick={() => {
                                setEditedText(extractedText);
                                showToast("Reset text back to original extracted CV.");
                              }}
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
