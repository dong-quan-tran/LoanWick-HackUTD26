import { expect, test } from 'vitest';
import { inspectContractFile } from '../src/adapters/contract-file';

test('records the fingerprint of the actual selected PDF bytes', async () => {
  const file = new File(['%PDF-1.7\nSYNTHETIC CONTRACT\n%%EOF'], 'loan-contract.pdf');
  const result = await inspectContractFile(file);
  expect(result.format).toBe('PDF'); expect(result.size).toBe(file.size);
  expect(result.sha256).toBe(Buffer.from(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())).toString('hex'));
});
test('accepts a DOCX package signature while rejecting a renamed ordinary ZIP', async () => {
  const result = await inspectContractFile(new File(['PK\x03\x04[Content_Types].xml word/document.xml'], 'loan-contract.docx'));
  expect(result.format).toBe('DOCX');
  await expect(inspectContractFile(new File(['PK\x03\x04other.txt'], 'renamed.docx'))).rejects.toThrow('DOCX package');
});
test('rejects wrong types, empty/oversized files, and a renamed non-PDF', async () => {
  await expect(inspectContractFile(new File(['text'], 'contract.txt'))).rejects.toThrow('PDF or DOCX');
  await expect(inspectContractFile(new File([], 'empty.pdf'))).rejects.toThrow('nonempty');
  await expect(inspectContractFile(new File(['text'], 'renamed.pdf'))).rejects.toThrow('PDF header');
  await expect(inspectContractFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf'))).rejects.toThrow('10 MB');
});
