import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnalysisSnapshot } from "@loanwick/contracts";
import type { DatabaseFindingInput } from "@loanwick/database-adapter";

import { loadConfig } from "./config/load-config.js";
import { loadEnvFile } from "./config/load-env-file.js";
import { WorkerRunError } from "./errors.js";
import { extractContract, MAX_UPLOAD_BYTES } from "./extraction/intake.js";
import { databaseFindings } from "./investigation/case-tools.js";
import { runCaseInvestigation } from "./investigation/run-case.js";
import { loadSeededLoans, uploadedFields, uploadSnapshot } from "./investigation/upload-snapshot.js";
import { createProvider } from "./provider/create-provider.js";
import { redactSecrets } from "./security/redact.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(here, "../.env"));
const seededLoans = loadSeededLoans(resolve(here, "../../.."));

const secrets = [process.env.NVIDIA_API_KEY ?? ""].filter((value) => value.length >= 8);
const host = "127.0.0.1";
const port = readPort(process.env.WORKER_API_PORT);
let busy = false;

const server = createServer((request, response) => {
  void handle(request, response);
});
server.listen(port, host, () => {
  console.log(`investigation api listening on ${host}:${port}`);
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = (request.url ?? "/").split("?")[0]?.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && path === "/api/health") {
    send(response, 200, { ok: true });
    return;
  }
  if ((request.method !== "GET" && request.method !== "POST") || path !== "/api/investigate") {
    send(response, 404, { error: "NOT_FOUND", message: "not found" });
    return;
  }
  if (busy) {
    send(response, 429, { error: "BUSY", message: "an investigation is already running" });
    return;
  }
  busy = true;
  try {
    const body = await readBody(request);
    if (body.length === 0) {
      const { fixture } = await import("../../../tests/helpers.js");
      send(response, 200, { source: "server-demo", ...(await investigate(fixture("app-excavator-a") as AnalysisSnapshot)) });
      return;
    }
    const contentType = request.headers["content-type"] ?? "application/octet-stream";
    const extraction = await extractContract(contentType, body);
    if (extraction.extractionStatus !== "extracted") {
      send(response, 422, { error: "EXTRACTION_UNSUPPORTED", message: extraction.failureReason ?? "the contract text could not be read" });
      return;
    }
    const sha256 = createHash("sha256").update(body).digest("hex");
    const filename = safeName(request.headers["x-filename"]);
    const snapshot = uploadSnapshot({ sha256, filename, extraction, loans: seededLoans });
    send(response, 200, {
      source: "uploaded-contract",
      filename,
      extracted: uploadedFields(extraction),
      comparedWith: seededLoans.map((loan) => ({ id: loan.id, businessName: loan.businessName })),
      ...(await investigate(snapshot)),
    });
  } catch (error) {
    const code = error instanceof WorkerRunError ? error.code : "PROVIDER_ERROR";
    const message = redactSecrets(error instanceof Error ? error.message : "unknown failure", secrets);
    const status = code === "INVALID_ARGUMENTS" ? 400 : code === "TIMEOUT" ? 504 : code === "CONFIG" ? 503 : 502;
    send(response, status, { error: code, message });
  } finally {
    busy = false;
  }
}

async function investigate(snapshot: AnalysisSnapshot) {
  const config = loadConfig(process.env);
  const names = new Map(snapshot.applications.map((application) => [application.id, application.businessName]));
  const publicFindings = (findings: DatabaseFindingInput[]) => findings.map((finding) => ({
    type: finding.type,
    title: finding.title,
    relatedApplicationIds: finding.relatedApplicationIds,
    relatedBusinessNames: finding.relatedApplicationIds.map((id) => names.get(id) ?? id),
  }));
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const result = await runCaseInvestigation({
        provider: createProvider(config),
        snapshot,
        maxSteps: config.maxSteps,
        signal: controller.signal,
      });
      return {
        applicationId: snapshot.applicationId,
        executionMode: result.executionMode,
        model: result.model,
        tools: result.toolEvents.map((event) => ({ name: event.toolName, status: event.status })),
        findings: publicFindings(result.findings),
        assistantSummary: result.assistantSummary,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  const code = lastError instanceof WorkerRunError ? lastError.code : "PROVIDER_ERROR";
  if (code === "CONFIG") {
    throw lastError;
  }
  return {
    applicationId: snapshot.applicationId,
    executionMode: config.executionMode,
    model: config.executionMode === "live" ? config.nvidiaModel : "fixture",
    tools: [],
    findings: publicFindings(await databaseFindings(snapshot)),
    assistantSummary: null,
    explanationError: code,
  };
}

function safeName(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw ?? "");
    } catch {
      return "";
    }
  })();
  const name = decoded.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9 ._()-]/g, "").trim().slice(0, 120) ?? "";
  return name.length > 0 ? name : "uploaded-contract.pdf";
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        request.destroy();
        reject(new WorkerRunError("INVALID_ARGUMENTS", "upload exceeds the 10 MB limit"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", () => reject(new WorkerRunError("PROVIDER_ERROR", "request failed")));
  });
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return 8787;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new WorkerRunError("CONFIG", "WORKER_API_PORT must be from 1 to 65535");
  }
  return port;
}
