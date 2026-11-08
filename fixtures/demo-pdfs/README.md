# Synthetic PDF demo pack

These are real, selectable-text PDF files for testing upload, extraction and database comparison. They contain fictional data only. No database is modified by generating or opening them.

## Files and expected results

| File | Use | Expected behavior |
| --- | --- | --- |
| `00-reference-northline.pdf` | Human-readable reference for the existing Northline seed loan | Reference only; do not upload it as another loan. |
| `01-duplicate-collateral.pdf` | Main demonstration: Redwood pledges forklift FL-004821 | Potential conflict against Northline and Pineworks, with evidence from both sides. |
| `02-unique-collateral.pdf` | Control: Sunrise pledges DEMO-PS-783260 | No exact identifier match against the unchanged eight-case seed; not a loan approval. |
| `03-missing-serial.pdf` | Incomplete application: Meadow omits a usable serial | Keep identifier null and request clarification; do not guess. |

`cases.json` is the editable input. `manifest.json` records expected extracted fields and SHA-256 hashes of the generated PDFs. The `.txt` companions describe the PDF text for troubleshooting. Expected results are evaluation data, not model input and not precomputed live findings.

## Existing database reference

The deployed backend commit `09288eb` and current main seed both define:

- `demo-case-1`: Northline Foods; USD 151,000; `demo-doc-1`, `demo-evidence-1`, forklift `FL-004821`.
- `demo-case-2`: Pineworks Supply; USD 152,000; `demo-doc-2`, `demo-evidence-2`, forklift `FL-004821`.
- Both collateral records assert exclusive ownership.

The source was verified in Git; current cloud rows still require an authorized read. The old cloud seed differs from main's source-backed evidence layout. Verify identifiers, ownership evidence and organization scope with the database member before a live demo. Missing evidence must produce an honest incomplete result, not a forced positive.

The reference PDF is newly generated. It is NOT the original `demo-doc-1` file, does not share its hash, and must not be substituted for the original evidence. No additional seed writes are needed if the above existing records are present. If they are absent, let the database owner prepare an isolated synthetic dataset rather than resetting shared data.

## Demo steps

1. Confirm Northline and Pineworks are visible to the officer and included in the worker's authorized comparison snapshot.
2. Create separate synthetic applications for Redwood (USD 180,000), Sunrise (USD 125,000) and Meadow (USD 95,000), in the same demo organization, using an authorized officer. Use a fresh run identifier to avoid overwriting shared cases.
3. Upload each matching PDF as a `collateral_schedule` to its application through the real upload service. Keep these applications out of submitted investigation state until their uploads and extraction are ready.
4. Confirm the worker stores the original PDF privately, records its real hash/version and extracts its fields and page references. Text is on page 1. Amounts in the manifest are integer cents.
5. Queue and run an investigation through the actual worker. Validate model output, then submit findings through the existing database workflow and confirm `worker_job_outcomes` acceptance.
6. Show a suspected duplicate with serial/ownership excerpts from the uploaded PDF and existing database evidence. Do not label the case proven fraud or auto-approve anything.
7. Run the unique-serial control and missing-serial case. Other baseline findings may exist; evaluate findings tied to the newly uploaded case rather than expecting the whole database to be clean.

Uploads alone do not create a borrower or application. The worker and UI upload integration must exist before this pack can demonstrate end-to-end AI processing. Keep PDF/DOCX upload enabled only when the server supports it. Do not feed `manifest.json`, these instructions or expected outcomes into the model.

Repeated uploads of the clean asset into different retained applications can legitimately produce a later conflict. Use an isolated demo organization/dataset, reuse an existing demo application under the owner's plan, or regenerate unique control identifiers. Do not delete shared cases to clean up a run.

## Regenerate

From the repo root, using Python 3:

```text
python scripts/generate-demo-pdfs.py
```

Generation uses only Python's standard library and is deterministic. No keys, network requests or database access are required. Scan/OCR testing is outside this text-PDF pack.
