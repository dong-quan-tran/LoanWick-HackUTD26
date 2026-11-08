import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnalysisSnapshot } from "@loanwick/contracts";

import { loadConfig } from "./config/load-config.js";
import { loadEnvFile } from "./config/load-env-file.js";
import { WorkerRunError } from "./errors.js";
import { runCaseInvestigation } from "./investigation/run-case.js";
import { createProvider } from "./provider/create-provider.js";
import { redactSecrets } from "./security/redact.js";

loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../.env"));

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
    await readLimited(request);
    const result = await investigateDemo();
    send(response, 200, result);
  } catch (error) {
    const code = error instanceof WorkerRunError ? error.code : "PROVIDER_ERROR";
    const message = redactSecrets(error instanceof Error ? error.message : "unknown failure", secrets);
    const status = code === "TIMEOUT" ? 504 : code === "CONFIG" ? 503 : 502;
    send(response, status, { error: code, message });
  } finally {
    busy = false;
  }
}

async function investigateDemo() {
  const config = loadConfig(process.env);
  const { fixture } = await import("../../../tests/helpers.js");
  const snapshot = fixture("app-excavator-a") as AnalysisSnapshot;
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
        source: "server-demo",
        executionMode: result.executionMode,
        model: result.model,
        tools: result.toolEvents.map((event) => ({ name: event.toolName, status: event.status })),
        findings: result.findings.map((finding) => ({
          type: finding.type,
          title: finding.title,
          relatedApplicationIds: finding.relatedApplicationIds,
        })),
        assistantSummary: result.assistantSummary,
      };
    } catch (error) {
      lastError = error;
      const retry = attempt === 1 && error instanceof WorkerRunError && error.code === "INVALID_ARGUMENTS";
      if (!retry) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
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

function readLimited(request: IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024) {
        request.destroy();
        reject(new WorkerRunError("INVALID_ARGUMENTS", "request body is too large"));
      }
    });
    request.on("end", () => resolve());
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
