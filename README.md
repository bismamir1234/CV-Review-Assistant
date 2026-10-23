# CV Assistant — FastAPI + React + SQLite

A starter CV review application: upload a DOCX, optionally paste a job description, extract text, receive suggestions, edit the revised text, preview it, and export plain text.

## MVP scope

### User journey
1. Upload a DOCX CV.
2. Optionally paste a target job description.
3. Review extracted text and AI suggestions.
4. Edit the proposed CV text yourself.
5. Preview and export `.txt`.
6. Clear the form; the associated review row is deleted from SQLite when the backend is reachable.

### Included
- React/Vite upload form, optional job-description field, submit and clear controls.
- Empty, loading, success and error states.
- FastAPI backend and SQLite storage for extracted text, job description and review output.
- DOCX paragraph and table extraction with `python-docx`.
- Groq-based AI suggestions when configured; clearly labelled demo fallback otherwise.
- User reminder to fact-check AI suggestions.

### Excluded from MVP
- PDF upload/OCR, accounts/authentication, multi-user access, cloud storage, multiple templates, ATS scoring guarantees, LinkedIn import, job applications, and formatting-preserving DOCX export.

## Supported format decision

MVP supports **DOCX only**, maximum 5 MB. See [`docs/parsing-decision.md`](docs/parsing-decision.md) for library comparison and OCR/layout limitations. Scanned PDFs require OCR and are not supported.

## Run locally

Requirements: Python 3.10+ and Node.js 18+.

### 1. Backend

Windows PowerShell:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Optional: edit .env and add your GROQ_API_KEY
uvicorn main:app --reload
```

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

The API runs at http://127.0.0.1:8000 and Swagger docs at http://127.0.0.1:8000/docs.
For Groq AI, add `GROQ_API_KEY` to `backend/.env`; the backend loads it with `python-dotenv`. Never commit a real API key.

Without an API key, the app uses labelled demo suggestions so the UI flow can still be tested.

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally http://localhost:5173).

## API endpoints

- `GET /api/health` — backend status and whether AI is configured.
- `POST /api/reviews` — multipart fields `cv_file` (DOCX) and `job_description` (optional).
- `DELETE /api/reviews/{review_id}` — deletes a saved review row.

## Database and privacy

SQLite creates `backend/cv_assistant.db` when the API is run from the backend folder. It stores extracted CV text, the optional job description, and the analysis result. The uploaded original file is not stored.

Use only sample/non-sensitive CVs while developing. The local prototype has no authentication, so do not expose it to the public internet. Add authentication, access controls, retention/deletion policy, HTTPS, and secret management before deployment. AI requests send CV text and the optional job description to the configured AI provider; obtain the user's consent and review provider privacy terms before using real CVs.

## Evidence checklist for the task

- [ ] Run the frontend and capture empty/loading/success/error screenshots.
- [ ] Commit the starter app and docs.
- [ ] Record parsing-library decision in `docs/parsing-decision.md`.
- [ ] Test valid DOCX, invalid file, empty DOCX, >5 MB file, AI configured, and demo mode.
- [ ] Verify Clear removes the saved review when API is available.

## Limitations / next steps

- Add `.env` loading (`python-dotenv`) or use environment variables directly.
- Add backend automated tests and file-content validation.
- Add PDF text extraction with PyMuPDF only after the DOCX flow is verified; add OCR separately for scanned PDFs.
- Consider exporting a formatted DOCX after preview/edit behavior is stable.
