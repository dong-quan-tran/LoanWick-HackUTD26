import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, sep } from "node:path";

import { WorkerRunError } from "../errors.js";
import { pdfPageText } from "./pdf-text.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UNATTACHED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DOCUMENT_TYPES = ["collateral_schedule", "financial_statement", "payment_instructions", "supporting_document"] as const;
const STORAGE_KEY = /^wk_[a-f0-9]{32}$/;
const SCHEMA_PATHS = [
  "businessName",
  "amountCents",
  "currency",
  "address",
  "syntheticRegistrationId",
  "syntheticAccountToken",
  "collateral.identifier",
  "collateral.exclusiveOwnershipClaim",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type ExtractionStatus = "extracted" | "failed" | "unsupported";

export type ExtractedEvidence = {
  id: string;
  excerpt: string;
  fieldName: string;
  fieldValue: string;
  extractionMethod: "structured" | "csv" | "pdf_text";
  locator: string;
  pageNumber?: number;
};

export type AuthorizedGrant = {
  id: string;
  applicationId: string;
  requestId?: string;
  documentType: string;
  uploaderId: string;
  applicationRevision: number;
  maxBytes: number;
  expiresAtMs: number;
  status: "ready" | "claimed" | "attached" | "revoked";
};

export type IngestInput = {
  root: string;
  grant: AuthorizedGrant;
  applicationId: string;
  documentType: string;
  requestId?: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
  nowMs: number;
  origin?: string;
  allowedOrigin?: string;
  cookie?: string;
  csrfToken?: string;
  expectedCsrf?: string;
  // Present only so callers cannot smuggle a role in. It is never consulted.
  presentedRole?: string;
  replacesVersion?: number;
};

export type StoredUpload = {
  storageKey: string;
  sha256: string;
  displayFilename: string;
  byteLength: number;
  applicationId: string;
  documentType: string;
  uploaderId: string;
  applicationRevision: number;
  version: number;
  extractionStatus: ExtractionStatus;
  evidence: ExtractedEvidence[];
  unknownFields: string[];
  syntheticDemoLabel: boolean;
  failureReason?: string;
};

export type AttachmentRequest = {
  sha256: string;
  displayFilename: string;
  storageKey: string;
  extractionStatus: ExtractionStatus;
  evidence: ExtractedEvidence[];
  byteLength: number;
  version: number;
  uploaderId: string;
  applicationId: string;
  documentType: string;
};

type Extraction = {
  extractionStatus: ExtractionStatus;
  evidence: ExtractedEvidence[];
  unknownFields: string[];
  syntheticDemoLabel: boolean;
  failureReason?: string;
};

export function assertWithinUploadLimit(byteLength: number, grantMaxBytes: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > MAX_UPLOAD_BYTES || byteLength > grantMaxBytes) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "upload exceeds the 10 MB limit");
  }
}

export async function ingestAuthorizedUpload(input: IngestInput): Promise<StoredUpload> {
  void input.presentedRole;
  authorize(input);
  const displayFilename = safeDisplayFilename(input.filename);
  const version = input.replacesVersion === undefined ? 1 : input.replacesVersion + 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "document version is not a positive integer");
  }
  mkdirSync(input.root, { recursive: true });
  assertPrivateRoot(input.root);
  const extraction = await extractDocument(input.contentType, input.bytes);
  const storageKey = `wk_${randomBytes(16).toString("hex")}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const stored: StoredUpload = {
    storageKey,
    sha256,
    displayFilename,
    byteLength: input.bytes.length,
    applicationId: input.grant.applicationId,
    documentType: input.grant.documentType,
    uploaderId: input.grant.uploaderId,
    applicationRevision: input.grant.applicationRevision,
    version,
    extractionStatus: extraction.extractionStatus,
    evidence: extraction.evidence.map((item, index) => ({ ...item, id: evidenceId(storageKey, index) })),
    unknownFields: extraction.unknownFields,
    syntheticDemoLabel: extraction.syntheticDemoLabel,
    ...(extraction.failureReason === undefined ? {} : { failureReason: extraction.failureReason }),
  };
  const dataPath = resolveInside(input.root, storageKey);
  const metaPath = resolveInside(input.root, `${storageKey}.meta.json`);
  writeFileSync(dataPath, input.bytes, { flag: "wx", mode: 0o600 });
  writeFileSync(metaPath, JSON.stringify(publicMeta(stored)), { flag: "wx", mode: 0o600 });
  return stored;
}

export function prepareAttachment(stored: StoredUpload, currentApplicationRevision: number): AttachmentRequest {
  if (currentApplicationRevision !== stored.applicationRevision) {
    throw new WorkerRunError("STALE_RESULTS", "application revision changed before attachment");
  }
  return {
    sha256: stored.sha256,
    displayFilename: stored.displayFilename,
    storageKey: stored.storageKey,
    extractionStatus: stored.extractionStatus,
    evidence: stored.evidence,
    byteLength: stored.byteLength,
    version: stored.version,
    uploaderId: stored.uploaderId,
    applicationId: stored.applicationId,
    documentType: stored.documentType,
  };
}

export function readAuthorizedDownload(root: string, storageKey: string, applicationId: string): Buffer {
  assertPrivateRoot(root);
  if (!STORAGE_KEY.test(storageKey)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "download storage key is not allowed");
  }
  const meta = readMeta(root, storageKey);
  if (meta.applicationId !== applicationId) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "download is outside this application");
  }
  const bytes = readFileSync(resolveInside(root, storageKey));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== meta.sha256) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "stored bytes do not match the recorded hash");
  }
  return bytes;
}

export function cleanupUnattachedUploads(
  root: string,
  nowMs: number,
  attachedKeys: ReadonlySet<string>,
  maxAgeMs = UNATTACHED_MAX_AGE_MS,
): string[] {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "cleanup age bound must be a positive integer");
  }
  assertPrivateRoot(root);
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    if (!STORAGE_KEY.test(name) || attachedKeys.has(name)) {
      continue;
    }
    const dataPath = resolveInside(root, name);
    const info = statSync(dataPath);
    if (!info.isFile() || nowMs - info.mtimeMs < maxAgeMs) {
      continue;
    }
    unlinkSync(dataPath);
    const metaName = `${name}.meta.json`;
    try {
      unlinkSync(resolveInside(root, metaName));
    } catch {
      // The data file was the canonical temporary object. A missing sidecar is already gone.
    }
    removed.push(name);
  }
  return removed.sort();
}

export function markUnattachedAge(root: string, storageKey: string, mtimeMs: number): void {
  const when = new Date(mtimeMs);
  utimesSync(resolveInside(root, storageKey), when, when);
}

function authorize(input: IngestInput): void {
  const grant = input.grant;
  if (grant.status !== "ready" || input.nowMs >= grant.expiresAtMs) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "upload grant is not active");
  }
  if (!DOCUMENT_TYPES.includes(grant.documentType as DocumentType) || input.documentType !== grant.documentType) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "document type is not authorized for this grant");
  }
  if (input.applicationId !== grant.applicationId) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "upload application does not match the grant");
  }
  if ((input.requestId ?? undefined) !== (grant.requestId ?? undefined)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "upload request does not match the grant");
  }
  if (input.origin !== undefined && input.allowedOrigin !== undefined && input.origin !== input.allowedOrigin) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "browser origin is not allowed");
  }
  if (input.cookie !== undefined && input.cookie.trim().length > 0) {
    if (input.expectedCsrf === undefined || input.expectedCsrf.length === 0 || input.csrfToken !== input.expectedCsrf) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "cookie upload requires a matching CSRF token");
    }
  }
  assertWithinUploadLimit(input.bytes.length, grant.maxBytes);
  const media = input.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (media !== "application/json" && media !== "text/csv" && media !== "application/pdf") {
    throw new WorkerRunError("INVALID_ARGUMENTS", "upload type must be JSON, CSV, or PDF");
  }
}

function safeDisplayFilename(filename: string): string {
  if (filename !== filename.trim() || filename.length === 0 || filename.length > 140) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "filename is not allowed");
  }
  if (filename === "." || filename === ".." || filename.includes("..") || /^[A-Za-z]:/.test(filename)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "filename is not allowed");
  }
  if (/[<>:"/\\|?*\x00-\x1f]/.test(filename)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "filename is not allowed");
  }
  return filename;
}

function assertPrivateRoot(root: string): void {
  const real = realpathSync(root);
  if (basename(real).toLowerCase() === "fixtures" || real.split(sep).some((part) => part.toLowerCase() === "fixtures")) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "refusing to use canonical fixtures as private upload storage");
  }
}

function resolveInside(root: string, name: string): string {
  if (!/^[a-z0-9._-]+$/i.test(name)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "storage name is not safe");
  }
  const rootReal = realpathSync(root);
  const target = join(rootReal, name);
  const fromRoot = relative(rootReal, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "path escapes the private upload directory");
  }
  return target;
}

function evidenceId(storageKey: string, index: number): string {
  return `ev_${storageKey.slice(3, 15)}_${index + 1}`;
}

function publicMeta(stored: StoredUpload) {
  return {
    storageKey: stored.storageKey,
    sha256: stored.sha256,
    displayFilename: stored.displayFilename,
    byteLength: stored.byteLength,
    applicationId: stored.applicationId,
    documentType: stored.documentType,
    uploaderId: stored.uploaderId,
    applicationRevision: stored.applicationRevision,
    version: stored.version,
    extractionStatus: stored.extractionStatus,
    unknownFields: stored.unknownFields,
    syntheticDemoLabel: stored.syntheticDemoLabel,
    ...(stored.failureReason === undefined ? {} : { failureReason: stored.failureReason }),
    evidence: stored.evidence,
  };
}

function readMeta(root: string, storageKey: string): { applicationId: string; sha256: string } {
  const raw = readFileSync(resolveInside(root, `${storageKey}.meta.json`), "utf8");
  const parsed = JSON.parse(raw) as { applicationId?: unknown; sha256?: unknown };
  if (typeof parsed.applicationId !== "string" || typeof parsed.sha256 !== "string") {
    throw new WorkerRunError("INVALID_ARGUMENTS", "stored upload metadata is incomplete");
  }
  return { applicationId: parsed.applicationId, sha256: parsed.sha256 };
}

async function extractDocument(contentType: string, bytes: Buffer): Promise<Extraction> {
  const media = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (media === "application/json") {
    return extractJson(bytes);
  }
  if (media === "text/csv") {
    return extractCsv(bytes);
  }
  if (media === "application/pdf") {
    return extractPdf(bytes);
  }
  return { extractionStatus: "failed", evidence: [], unknownFields: [], syntheticDemoLabel: false, failureReason: "unsupported type" };
}

function extractJson(bytes: Buffer): Extraction {
  const source = stripBom(bytes.toString("utf8"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return failed("malformed JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failed("malformed JSON");
  }
  const record = parsed as Record<string, unknown>;
  const label = record.label;
  if (label !== undefined && label !== "SYNTHETIC DEMO DOCUMENT") {
    return failed("synthetic demo label is not the required text");
  }
  const evidence: ExtractedEvidence[] = [];
  const unknownFields: string[] = [];
  for (const path of SCHEMA_PATHS) {
    const keys = path.split(".");
    const value = valueAt(record, keys);
    if (value === undefined) {
      unknownFields.push(path);
      continue;
    }
    const fieldValue = typedField(path, value);
    if (fieldValue === undefined) {
      return failed("malformed JSON");
    }
    const excerpt = jsonExcerpt(source, keys[keys.length - 1] ?? path, value);
    if (excerpt === undefined || !source.includes(excerpt)) {
      return failed("JSON field is not present in the source text");
    }
    evidence.push({
      id: "pending",
      excerpt,
      fieldName: keys[keys.length - 1] ?? path,
      fieldValue,
      extractionMethod: "structured",
      locator: `$.${path}`,
    });
  }
  return {
    extractionStatus: "extracted",
    evidence,
    unknownFields,
    syntheticDemoLabel: label === "SYNTHETIC DEMO DOCUMENT",
  };
}

function extractCsv(bytes: Buffer): Extraction {
  const source = stripBom(bytes.toString("utf8"));
  let rows: string[][];
  try {
    rows = parseCsv(source);
  } catch {
    return failed("malformed CSV");
  }
  if (rows.length < 2) {
    return failed("malformed CSV");
  }
  const header = rows[0];
  if (header === undefined || new Set(header).size !== header.length || header.some((cell) => cell.trim().length === 0)) {
    return failed("malformed CSV");
  }
  const known = new Set<string>(["label", ...SCHEMA_PATHS.filter((path) => !path.includes("."))]);
  known.add("identifier");
  known.add("exclusiveOwnershipClaim");
  if (!header.some((cell) => known.has(cell))) {
    return failed("malformed CSV");
  }
  const evidence: ExtractedEvidence[] = [];
  const unknownFields: string[] = [];
  let syntheticDemoLabel = false;
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row === undefined || row.length !== header.length) {
      return failed("malformed CSV");
    }
    const fileRow = rowIndex + 1;
    for (let column = 0; column < header.length; column += 1) {
      const name = header[column] ?? "";
      const cell = row[column] ?? "";
      if (!known.has(name) || name === "label") {
        if (name === "label" && cell === "SYNTHETIC DEMO DOCUMENT") {
          syntheticDemoLabel = true;
        }
        if (name === "label" && cell.length > 0 && cell !== "SYNTHETIC DEMO DOCUMENT") {
          return failed("synthetic demo label is not the required text");
        }
        continue;
      }
      const locator = `row ${fileRow} column ${name}`;
      if (cell.length === 0) {
        unknownFields.push(locator);
        continue;
      }
      const fieldValue = typedCsv(name, cell);
      if (fieldValue === undefined) {
        return failed("malformed CSV");
      }
      if (!source.includes(cell)) {
        return failed("CSV cell is not present in the source text");
      }
      evidence.push({
        id: "pending",
        excerpt: cell,
        fieldName: name,
        fieldValue,
        extractionMethod: "csv",
        locator,
      });
    }
  }
  return { extractionStatus: "extracted", evidence, unknownFields, syntheticDemoLabel };
}

async function extractPdf(bytes: Buffer): Promise<Extraction> {
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return failed("malformed PDF");
  }
  let pages: string[];
  try {
    pages = await pdfPageText(bytes);
  } catch {
    return failed("malformed PDF");
  }
  const text = pages.join("\n").trim();
  if (text.length === 0) {
    return {
      extractionStatus: "unsupported",
      evidence: [],
      unknownFields: [...SCHEMA_PATHS],
      syntheticDemoLabel: false,
      failureReason: "PDF has no extractable text",
    };
  }
  const evidence: ExtractedEvidence[] = [];
  const found = new Set<string>();
  let syntheticDemoLabel = false;
  pages.forEach((page, pageIndex) => {
    const lines = page.split("\n");
    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (trimmed === "SYNTHETIC DEMO DOCUMENT") {
        syntheticDemoLabel = true;
        return;
      }
      const labeled = labeledPdfField(trimmed);
      const prose = trimmed.match(/^(.+) claims exclusive ownership of forklift ([A-Za-z0-9-]+)\.?$/);
      const human = humanPdfFields(trimmed);
      const fields = human.length > 0
        ? human
        : labeled === undefined && prose !== null
          ? [
              { path: "businessName", value: prose[1] ?? "" },
              { path: "collateral.identifier", value: prose[2] ?? "" },
              { path: "collateral.exclusiveOwnershipClaim", value: "true" },
            ]
          : labeled === undefined ? [] : [labeled];
      for (const field of fields) {
        if (field.value.length === 0 || found.has(field.path) || !page.includes(trimmed)) {
          continue;
        }
        found.add(field.path);
        const leaf = field.path.split(".").pop() ?? field.path;
        evidence.push({
          id: "pending",
          excerpt: trimmed,
          fieldName: leaf,
          fieldValue: field.value,
          extractionMethod: "pdf_text",
          locator: `page ${pageIndex + 1} line ${lineIndex + 1}`,
          pageNumber: pageIndex + 1,
        });
      }
    });
  });
  return {
    extractionStatus: "extracted",
    evidence,
    unknownFields: SCHEMA_PATHS.filter((path) => !found.has(path)),
    syntheticDemoLabel,
  };
}

function humanPdfFields(line: string): { path: string; value: string }[] {
  const business = line.match(/^Business name:\s*(.+)$/i);
  if (business?.[1] !== undefined) {
    return [{ path: "businessName", value: business[1].trim() }];
  }
  const currency = line.match(/^Currency:\s*([A-Z]{3})$/);
  if (currency?.[1] !== undefined) {
    return [{ path: "currency", value: currency[1] }];
  }
  const amount = line.match(/^Requested loan amount:\s*([A-Z]{3})\s+([0-9][0-9,]*)\.(\d{2})$/);
  if (amount?.[1] !== undefined && amount[2] !== undefined && amount[3] !== undefined) {
    const cents = centsFromDollars(amount[2], amount[3]);
    return cents === undefined ? [] : [
      { path: "amountCents", value: cents },
      { path: "currency", value: amount[1] },
    ];
  }
  const serial = line.match(/^Equipment serial number:\s*(.+)$/i);
  if (serial?.[1] !== undefined) {
    if (/^not provided\b/i.test(serial[1].trim())) {
      return [];
    }
    return [{ path: "collateral.identifier", value: serial[1].trim() }];
  }
  if (/claims sole and exclusive ownership/i.test(line)) {
    return [{ path: "collateral.exclusiveOwnershipClaim", value: "true" }];
  }
  return [];
}

function centsFromDollars(whole: string, fraction: string): string | undefined {
  if (!/^\d{2}$/.test(fraction)) {
    return undefined;
  }
  const digits = whole.replaceAll(",", "");
  if (!/^\d+$/.test(digits)) {
    return undefined;
  }
  return String(BigInt(digits) * 100n + BigInt(fraction));
}

function labeledPdfField(line: string): { path: string; value: string } | undefined {
  const match = line.match(/^(businessName|amountCents|currency|address|syntheticRegistrationId|syntheticAccountToken|identifier|exclusiveOwnershipClaim):\s*(\S(?:.*\S)?)$/);
  if (match === null) {
    return undefined;
  }
  const name = match[1] ?? "";
  const value = match[2] ?? "";
  const path = name === "identifier" ? "collateral.identifier"
    : name === "exclusiveOwnershipClaim" ? "collateral.exclusiveOwnershipClaim"
      : name;
  if (typedCsv(name === "identifier" ? "identifier" : name === "exclusiveOwnershipClaim" ? "exclusiveOwnershipClaim" : name, value) === undefined) {
    return undefined;
  }
  return { path, value };
}

function typedField(path: string, value: unknown): string | undefined {
  if (path === "amountCents") {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
  }
  if (path === "currency") {
    return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : undefined;
  }
  if (path === "collateral.exclusiveOwnershipClaim") {
    return typeof value === "boolean" ? String(value) : undefined;
  }
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function typedCsv(name: string, value: string): string | undefined {
  if (name === "amountCents") {
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? value : undefined;
  }
  if (name === "currency") {
    return /^[A-Z]{3}$/.test(value) ? value : undefined;
  }
  if (name === "exclusiveOwnershipClaim") {
    return value === "true" || value === "false" ? value : undefined;
  }
  return value.trim().length > 0 ? value : undefined;
}

function valueAt(record: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = record;
  for (const key of keys) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function jsonExcerpt(source: string, key: string, value: unknown): string | undefined {
  const rendered = typeof value === "string" ? JSON.stringify(value) : String(value);
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*${escapeRegExp(rendered)}`);
  return pattern.exec(source)?.[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"") {
        if (source[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char ?? "";
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      cell = "";
      if (row.some((item) => item.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += char ?? "";
  }
  if (quoted) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "malformed CSV");
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function failed(failureReason: string): Extraction {
  return { extractionStatus: "failed", evidence: [], unknownFields: [], syntheticDemoLabel: false, failureReason };
}
