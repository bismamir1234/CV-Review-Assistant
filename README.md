# CV Assistant — AI Review & Job Matching Studio

A comprehensive, truthful full-stack CV review and job description matching platform built with **FastAPI**, **React (Vite)**, and **SQLite**, with AI reasoning powered by **Groq** (and an intelligent local heuristic demo engine for offline testing).

---

## Key Features

### 1. AI-Powered CV Suggestions
- Reviews extracted CV text for:
  1. Grammar and spelling.
  2. Sentence clarity and readability.
  3. Professional tone and wording.
  4. Strong, relevant action verbs.
  5. Alignment with the user's target role.
  6. Actionable, practical improvement proposals.
- **Detailed Suggestion Schema:**
  - `original_statement`: Verbatim excerpt from the CV.
  - `issue_identified`: Specific problem found in the phrasing.
  - `suggested_rewrite`: Fact-preserving rewritten statement.
  - `explanation`: Clear rationale for why the revision helps.
  - `facts_to_verify`: Specific metrics, dates, or tools the user **must** verify before use.
- **User-Controlled Decision Model:**
  - **Accept**: Incorporates the suggested rewrite directly into the editable draft.
  - **Reject**: Dismisses the suggestion, leaving the original text unchanged.
  - **Edit**: Lets the candidate customize proposed wording prior to applying.
  - **Anti-Hallucination Guardrail**: The AI never invents skills, certifications, degrees, dates, metrics, or employers.

### 2. CV and Job Description Matching
- Compares the uploaded CV with target job requirements and outputs:
  1. **Matched Skills & Requirements:** Directly evidenced by quoted CV text.
  2. **Possible Gaps:** Explicitly notes requirements **not found in the provided CV** (without assuming the candidate lacks real-world capability).
  3. **Relevant Keywords:** Broken down into:
     - *Supported Keywords:* Validated by actual experience in the CV.
     - *Keywords Requiring Verification:* Present in job description; user must verify before including.
  4. **Uncertain / Ambiguous Matches:** Highlights vague or unquantified claims.
  5. **Honest Recommendations:** Actionable tips to tailor the CV without exaggerating credentials.
  6. **Coverage Score:** Quantifies keyword/requirement alignment with a clear disclaimer:
     > *"This score measures keyword and requirement coverage based on the provided CV text. It is NOT a hiring prediction, ATS pass guarantee, or assessment of your qualifications."*

### 3. Privacy & PII Redaction
- Automatic PII Sanitizer strips email addresses, phone numbers, and postal codes before sending text to the AI model.
- Original DOCX binary files are never saved on disk. Only extracted text and review results are stored in SQLite.

---

## Tech Stack

- **Frontend:** React 18, Vite 6, Modern Responsive Vanilla CSS (Design system with Dark/Light theme).
- **Backend:** Python 3.10+, FastAPI, Uvicorn, SQLAlchemy, SQLite, `python-docx`.
- **AI Integration:** Groq SDK (`llama-3.3-70b-versatile`) with automatic fallback to local heuristic analysis when an API key is not supplied.
- **Testing:** Pytest, HTTPX TestClient.

---

## Project Structure

```text
cv_assistant_fullstack/
├── backend/
│   ├── tests/
│   │   └── test_cv_features.py   # Automated pytest suite (validation, PII, 3 synthetic cases)
│   ├── conftest.py               # Pytest path configuration
│   ├── cv_assistant.db           # SQLite database
│   ├── main.py                   # FastAPI application & endpoints
│   ├── requirements.txt          # Python dependencies
│   ├── .env.example              # Environment variables template
│   └── .env                      # Local environment configuration
├── docs/
│   ├── parsing-decision.md       # Text-extraction library comparison (python-docx vs PDF/OCR)
│   └── synthetic_evaluations.md  # Detailed evaluation of 3 synthetic hallucination test cases
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # React UI with Suggestions & Job Matching
│   │   ├── styles.css            # Dark/light theme design system
│   │   └── sampleData.js         # Benchmark test profiles & weak bullet presets
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── sample_resume.docx            # Sample test CV
└── README.md
```

---

## Getting Started

### 1. Environment Configuration

Copy `.env.example` in `backend/`:
```bash
cd backend
cp .env.example .env
```
Edit `backend/.env` to configure your settings:
```env
DATABASE_URL=sqlite:///./cv_assistant.db
# Optional: Add your Groq API key for live LLM analysis.
# If omitted, the app operates in labeled local heuristic demo mode.
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

### 2. Backend Setup & Run

**Windows PowerShell:**
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**macOS/Linux:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
- API root: `http://127.0.0.1:8000`
- Interactive Swagger API docs: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup & Run

In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL: **`http://localhost:5173`** (or `http://127.0.0.1:5173`).

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend status & whether Groq AI is configured |
| `POST` | `/api/cv/review` | JSON endpoint: reviews CV text for grammar, clarity, verbs, and suggestions |
| `POST` | `/api/cv/match-job` | JSON endpoint: matches CV text against a job description |
| `POST` | `/api/reviews` | Multipart endpoint: uploads DOCX, extracts text, runs review & matching, stores in SQLite |
| `DELETE` | `/api/reviews/{id}` | Deletes a stored review row from SQLite |

---

## How to Execute Automated Tests

Run the complete test suite using pytest inside the `backend/` directory:
```bash
cd backend
pytest -v
```

### Tested Scenarios:
1. `test_health_check` — Endpoint availability and AI configuration flag.
2. `test_cv_review_empty_text` — Rejection of empty or whitespace-only CV submissions.
3. `test_job_match_empty_cv` — Validation when CV is missing for job matching.
4. `test_job_match_empty_jd` — Validation when job description is missing.
5. `test_pii_sanitization` — Masking of emails, phone numbers, and postal codes before LLM transmission.
6. `test_cv_review_suggestions_schema` — Validation of `original_statement`, `issue_identified`, `suggested_rewrite`, `explanation`, and `facts_to_verify`.
7. `test_synthetic_case_1_invented_credentials` — Verifies the AI does not award or invent unearned cloud certifications.
8. `test_synthetic_case_2_inflated_experience` — Verifies a student project is not transformed into 3 years of employment.
9. `test_synthetic_case_3_unsupported_skills` — Verifies unsupported skills are isolated as gaps rather than claimed matches.

See [`docs/synthetic_evaluations.md`](docs/synthetic_evaluations.md) for full input/output logs and evaluation criteria.

---

## Screenshot Capture Checklist

Capture the following screenshots from `http://localhost:5173` for submission evidence:
1. **CV Review Input:** Dropzone with an uploaded `.docx` CV and target job description entered.
2. **AI Suggestions Panel:** Suggestions showing original statement vs proposed wording, issues identified, facts to verify, and Accept/Reject/Edit buttons.
3. **Job-Matching Results:** Matched skills cards displaying quoted evidence from the CV.
4. **Possible Gaps & Keywords:** Missing requirements marked as not evidenced in CV, plus supported vs verification-needed keyword chips.
5. **Review-Before-Use Warning:** The mandatory disclaimer banner prominently displayed at the top of the results.
6. **Test Results:** Terminal output showing `pytest -v` with all 9 tests passing.

---

## Known Limitations & Future Work

- **Format:** The MVP accepts **DOCX only** (≤ 5 MB). Scanned PDFs require OCR (e.g. Tesseract) and are rejected with a clear user notice (see [`docs/parsing-decision.md`](docs/parsing-decision.md)).
- **Export:** Revised CVs are exported as clean plain text (`.txt`). Preserving native Word typography and styling is planned for a future update.
