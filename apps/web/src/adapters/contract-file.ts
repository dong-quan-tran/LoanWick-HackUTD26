export interface ContractFile {
  name: string;
  size: number;
  format: 'PDF' | 'DOCX';
  sha256: string;
}
export async function inspectContractFile(file: File): Promise<ContractFile> {
  if (file.size < 1 || file.size > 10_000_000) throw new Error('Choose a nonempty contract no larger than 10 MB.');
  const format = /\.pdf$/i.test(file.name) ? 'PDF' : /\.docx$/i.test(file.name) ? 'DOCX' : null;
  if (!format) throw new Error('Choose a PDF or DOCX contract.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  if (format === 'PDF' && !text.slice(0, 1024).includes('%PDF-')) throw new Error('This file does not have a PDF header. Choose the original PDF contract.');
  if (format === 'DOCX' && (bytes[0] !== 0x50 || bytes[1] !== 0x4b || !text.includes('[Content_Types].xml') || !text.includes('word/document.xml'))) throw new Error('This file does not have a DOCX package structure. Choose the original Word contract.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return { name: file.name, size: file.size, format, sha256: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('') };
}
