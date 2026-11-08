"""Generate deterministic, selectable-text demo PDFs using Python's standard library.
Run from any directory: python scripts/generate-demo-pdfs.py
No network, AI key, database writes, or third-party packages are used.
"""
from pathlib import Path
import hashlib
import json
import textwrap

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "demo-pdfs"


def pdf_escape(value):
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(lines):
    commands = ["BT", "/F1 11 Tf", "15 TL", "50 750 Td"]
    for i, line in enumerate(lines):
        if i:
            commands.append("T*")
        commands.append("(" + pdf_escape(line) + ") Tj")
    commands.append("ET")
    stream = ("\n".join(commands) + "\n").encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
    ]
    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
    return bytes(data)


def main():
    cases = json.loads((OUT / "cases.json").read_text(encoding="utf-8"))["cases"]
    manifest = {"synthetic": True, "database": "loanwick-hackutd26-dev", "files": []}
    for case in cases:
        serial = case["equipmentIdentifier"] or "NOT PROVIDED - identifier plate unreadable"
        amount = f"USD {case['amountCents'] / 100:,.2f}"
        paragraphs = [
            "LOANWICK DEMO - SYNTHETIC DOCUMENT", "COMMERCIAL LOAN COLLATERAL SCHEDULE", "",
            "Application reference: " + case["applicationReference"],
            "Document date: November 8, 2026", "Business name: " + case["businessName"],
            "Requested loan amount: " + amount, "Currency: USD", "",
            "Equipment description: " + case["equipmentDescription"], "Equipment serial number: " + serial,
            "Quantity: 1", "Ownership declaration:",
            case["businessName"] + " claims sole and exclusive ownership of the listed equipment.",
            "The listed equipment is offered as collateral for this application.", "",
            "Business purpose: " + case["purpose"], "",
            "Applicant representative: Synthetic Demo Representative", "Signature: UNSIGNED DEMO COPY", "",
            "All names, identifiers and amounts are fictional. No real borrower data.",
            "This document is test input, not a loan approval or evidence of real fraud.",
        ]
        lines = []
        for paragraph in paragraphs:
            lines.extend(textwrap.wrap(paragraph, width=86) or [""])
        if len(lines) > 46:
            raise ValueError("Document exceeds the one-page layout")
        data = make_pdf(lines)
        (OUT / case["filename"]).write_bytes(data)
        (OUT / (Path(case["filename"]).stem + ".txt")).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        manifest["files"].append({"filename": case["filename"], "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "expectedExtraction": {key: case[key] for key in ["businessName", "amountCents", "currency", "equipmentDescription", "equipmentIdentifier", "exclusiveOwnershipClaim"]}, "expectedBehavior": case["expected"]})
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Generated {len(cases)} PDFs and text companions in {OUT}")


if __name__ == "__main__":
    main()
