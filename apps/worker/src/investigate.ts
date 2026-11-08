import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnalysisSnapshot } from "@loanwick/contracts";

import { loadConfig } from "./config/load-config.js";
import { loadEnvFile } from "./config/load-env-file.js";
import { WorkerRunError } from "./errors.js";
import { runQueuedCloudJob } from "./investigation/cloud-run.js";
import { runCaseInvestigation } from "./investigation/run-case.js";
import { createProvider } from "./provider/create-provider.js";
import { redactSecrets } from "./security/redact.js";

loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../.env"));

const secrets = [process.env.NVIDIA_API_KEY ?? ""].filter((value) => value.length >= 8);

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    if ((process.env.SPACETIMEDB_TOKEN ?? "").trim().length > 0) {
      const result = await runQueuedCloudJob(config, controller.signal);
      console.log(JSON.stringify(publicResult(result), null, 2));
      return;
    }
    const { fixture } = await import("../../../tests/helpers.js");
    const snapshot = fixture("app-excavator-a") as AnalysisSnapshot;
    const result = await runCaseInvestigation({
      provider: createProvider(config),
      snapshot,
      maxSteps: config.maxSteps,
      signal: controller.signal,
    });
    console.log(JSON.stringify({ source: "local-demo", ...publicResult(result) }, null, 2));
  } catch (error) {
    const code = error instanceof WorkerRunError ? error.code : "PROVIDER_ERROR";
    const message = redactSecrets(error instanceof Error ? error.message : "unknown failure", secrets);
    console.error(JSON.stringify({ error: code, message }));
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

function publicResult(result: {
  executionMode: string;
  model: string;
  assistantSummary: string;
  findings: { type: string; title: string; relatedApplicationIds: string[] }[];
  toolEvents: { toolName: string; status: string }[];
  jobId?: string | undefined;
  outcome?: string | undefined;
  modelId?: string | undefined;
  drafts?: { state: string; sent: boolean; template: string }[] | undefined;
  draftErrors?: { message: string }[] | undefined;
}) {
  return {
    executionMode: result.executionMode,
    model: result.model,
    modelId: result.modelId,
    jobId: result.jobId,
    outcome: result.outcome,
    tools: result.toolEvents.map((event) => ({ name: event.toolName, status: event.status })),
    findings: result.findings.map((finding) => ({
      type: finding.type,
      title: finding.title,
      relatedApplicationIds: finding.relatedApplicationIds,
    })),
    drafts: result.drafts?.map((draft) => ({ state: draft.state, sent: draft.sent, template: draft.template })),
    draftErrors: result.draftErrors?.map((error) => error.message),
    assistantSummary: result.assistantSummary,
  };
}

await main();
