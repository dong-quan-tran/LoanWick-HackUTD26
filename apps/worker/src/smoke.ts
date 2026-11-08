import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config/load-config.js";
import { loadEnvFile } from "./config/load-env-file.js";
import { WorkerRunError } from "./errors.js";
import { createProvider } from "./provider/create-provider.js";
import { runToolSmoke } from "./provider/run-tool-smoke.js";
import { redactSecrets } from "./security/redact.js";

loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../.env"));

const secrets = [process.env.NVIDIA_API_KEY ?? ""].filter((value) => value.length >= 8);

async function main(): Promise<void> {
  let executionMode: "live" | "fixture" | "unconfigured" = "unconfigured";
  try {
    const config = loadConfig(process.env);
    executionMode = config.executionMode;
    const provider = createProvider(config);
    const result = await runToolSmoke({
      provider,
      now: () => new Date().toISOString(),
      maxSteps: config.maxSteps,
      timeoutMs: config.timeoutMs,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const code = error instanceof WorkerRunError ? error.code : "PROVIDER_ERROR";
    const message = redactSecrets(error instanceof Error ? error.message : "unknown failure", secrets);
    console.error(
      JSON.stringify({
        executionMode,
        connectedDatabase: false,
        error: code,
        message,
      }),
    );
    process.exitCode = 1;
  }
}

await main();
