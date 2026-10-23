# Parsing-library decision

## MVP decision: DOCX only, using `python-docx`

The first version accepts `.docx` files and extracts document paragraphs plus table-cell text with `python-docx`. This keeps the first implementation narrow and easy to validate.

### Alternatives considered

| Library | Format | Strengths | Limitations |
|---|---|---|---|
| `python-docx` | DOCX | Simple paragraph/table extraction; Python-native | Does not parse PDF; some text boxes/shapes and complex layout may be missed |
| PyMuPDF (`pymupdf`) | PDF | Fast text extraction, page-level APIs | Scanned/image-only PDFs need OCR; multi-column reading order may need correction |
| `pypdf` | PDF | Straightforward PDF text extraction | Complex layouts can yield scrambled text; no built-in OCR |
| `pdfplumber` | PDF | Helpful for character positions, tables and layout inspection | More involved for basic extraction; no built-in OCR |

## Known limitations

- Only DOCX is accepted in the MVP; PDFs are rejected with a clear message.
- A damaged or password-protected DOCX may not open.
- Text in images, some text boxes/shapes, and highly complex formatting may not be extracted.
- Extracted text does not preserve original visual styling.
- Scanned PDFs are images rather than selectable text. A future PDF feature would need OCR (for example, Tesseract) or an OCR service, followed by extraction-quality checks.
- The MVP exports reviewed content as `.txt`; preserving DOCX formatting is future work.

## Validation plan

Test a simple DOCX with paragraphs, a DOCX with tables, an empty DOCX, a damaged file, a non-DOCX file, and a file exceeding the 5 MB limit.
