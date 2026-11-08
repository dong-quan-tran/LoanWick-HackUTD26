import { WorkerRunError } from "../errors.js";
import type { ExecutionMode } from "../provider/types.js";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MAX_STEPS = 8;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_UPLOAD_DIR = "var/uploads";

type SharedConfig = {
  maxSteps: number;
  timeoutMs: number;
  uploadDir: string;
  nvidiaBaseUrl: string;
};

export type FixtureConfig = SharedConfig & {
  executionMode: "fixture";
};

export type LiveConfig = SharedConfig & {
  executionMode: "live";
  nvidiaApiKey: string;
  nvidiaModel: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
  reasoningBudget?: number;
};

export type WorkerConfig = FixtureConfig | LiveConfig;

export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const executionMode = readMode(env.AGENT_MODE);
  const maxSteps = readInt(env.AGENT_MAX_STEPS, DEFAULT_MAX_STEPS, "AGENT_MAX_STEPS");
  if (maxSteps < 1 || maxSteps > 8) {
    throw new WorkerRunError("CONFIG", "AGENT_MAX_STEPS must be from 1 to 8");
  }
  const timeoutMs = readInt(env.AGENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "AGENT_TIMEOUT_MS");
  if (timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new WorkerRunError("CONFIG", "AGENT_TIMEOUT_MS must be from 1000 to 120000");
  }
  const uploadDir = (env.WORKER_UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR).trim();
  if (uploadDir.length === 0) {
    throw new WorkerRunError("CONFIG", "WORKER_UPLOAD_DIR is empty");
  }
  const nvidiaBaseUrl = (env.NVIDIA_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!nvidiaBaseUrl.startsWith("https://")) {
    throw new WorkerRunError("CONFIG", "NVIDIA_BASE_URL must be an https URL");
  }

  const shared = { maxSteps, timeoutMs, uploadDir, nvidiaBaseUrl };
  if (executionMode === "fixture") {
    return { executionMode, ...shared };
  }

  const nvidiaApiKey = (env.NVIDIA_API_KEY ?? "").trim();
  const nvidiaModel = (env.NVIDIA_MODEL ?? "").trim();
  if (nvidiaApiKey.length === 0 || nvidiaModel.length === 0) {
    throw new WorkerRunError(
      "CONFIG",
      "AGENT_MODE=live requires NVIDIA_API_KEY and NVIDIA_MODEL. Fixture mode was not substituted.",
    );
  }
  const maxTokens = readInt(env.NVIDIA_MAX_TOKENS, 512, "NVIDIA_MAX_TOKENS");
  if (maxTokens < 1 || maxTokens > 65_536) {
    throw new WorkerRunError("CONFIG", "NVIDIA_MAX_TOKENS must be from 1 to 65536");
  }
  const temperature = readDecimal(env.NVIDIA_TEMPERATURE, 0, "NVIDIA_TEMPERATURE");
  if (temperature < 0 || temperature > 2) {
    throw new WorkerRunError("CONFIG", "NVIDIA_TEMPERATURE must be from 0 to 2");
  }
  const topP = readOptionalDecimal(env.NVIDIA_TOP_P, "NVIDIA_TOP_P");
  if (topP !== undefined && (topP <= 0 || topP > 1)) {
    throw new WorkerRunError("CONFIG", "NVIDIA_TOP_P must be greater than 0 and at most 1");
  }
  const reasoningBudget = readOptionalInt(env.NVIDIA_REASONING_BUDGET, "NVIDIA_REASONING_BUDGET");
  if (reasoningBudget !== undefined && (reasoningBudget < 1 || reasoningBudget > maxTokens)) {
    throw new WorkerRunError("CONFIG", "NVIDIA_REASONING_BUDGET must be from 1 through NVIDIA_MAX_TOKENS");
  }
  return {
    executionMode,
    nvidiaApiKey,
    nvidiaModel,
    maxTokens,
    temperature,
    ...(topP === undefined ? {} : { topP }),
    ...(reasoningBudget === undefined ? {} : { reasoningBudget }),
    ...shared,
  };
}

function readMode(raw: string | undefined): ExecutionMode {
  const mode = (raw ?? "fixture").trim().toLowerCase();
  if (mode === "fixture" || mode === "live") {
    return mode;
  }
  throw new WorkerRunError("CONFIG", "AGENT_MODE must be fixture or live");
}

function readInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return parseWhole(raw, name);
}

function readOptionalInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return parseWhole(raw, name);
}

function parseWhole(raw: string, name: string): number {
  if (!/^\d+$/.test(raw.trim())) {
    throw new WorkerRunError("CONFIG", `${name} must be an integer`);
  }
  return Number(raw.trim());
}

function readDecimal(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return parseDecimal(raw, name);
}

function readOptionalDecimal(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return parseDecimal(raw, name);
}

function parseDecimal(raw: string, name: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(raw.trim())) {
    throw new WorkerRunError("CONFIG", `${name} must be a number`);
  }
  return Number(raw.trim());
}
