import type { WorkerConfig } from "../config/load-config.js";
import { FixtureProvider } from "./fixture-provider.js";
import { NvidiaProvider } from "./nvidia-provider.js";
import type { ModelProvider } from "./types.js";

export function createProvider(config: WorkerConfig, fetchImpl?: typeof fetch): ModelProvider {
  if (config.executionMode === "fixture") {
    return new FixtureProvider();
  }
  return new NvidiaProvider({
    apiKey: config.nvidiaApiKey,
    baseUrl: config.nvidiaBaseUrl,
    model: config.nvidiaModel,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    ...(config.topP === undefined ? {} : { topP: config.topP }),
    ...(config.reasoningBudget === undefined ? {} : { reasoningBudget: config.reasoningBudget }),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
}
