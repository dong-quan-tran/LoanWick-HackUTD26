import { extractText } from "unpdf";

// unpdf 2.1 extractText(data, { mergePages: false }) returns one string per page.
// The strings are the parser's text for those PDF bytes. Scanned pages come back empty.
export async function pdfPageText(bytes: Uint8Array): Promise<string[]> {
  // pdf.js rejects Node Buffer even though it extends Uint8Array.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const extracted = await extractText(data, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return pages.map((page) => page.replace(/\r\n/g, "\n"));
}

// A tiny Type1 page, the same text operators the demo PDF generator writes.
// Tests use these bytes. They do not read an expected-result sidecar.
export function makeTextPdf(lines: readonly string[]): Buffer {
  const escaped = lines.map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const commands = ["BT", "/F1 11 Tf", "15 TL", "50 750 Td", ...escaped.flatMap((line) => [`(${line}) Tj`, "T*"]), "ET"];
  const stream = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
