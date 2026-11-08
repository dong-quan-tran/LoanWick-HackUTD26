import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/load-config.js";
import { WorkerRunError } from "../src/errors.js";

describe("loadConfig", () => {
  it("defaults to fixture and drops a live key", () => {
    const config = loadConfig({ NVIDIA_API_KEY: "nvapi-unit-test-secret" });
    expect(config.executionMode).toBe("fixture");
    expect(JSON.stringify(config)).not.toContain("nvapi-unit-test-secret");
    expect("nvidiaApiKey" in config).toBe(false);
  });

  it("refuses live mode instead of substituting fixture", () => {
    expect(() => loadConfig({ AGENT_MODE: "live", NVIDIA_MODEL: "nvidia/configured-model" })).toThrow(WorkerRunError);
    try {
      loadConfig({ AGENT_MODE: "live", NVIDIA_MODEL: "nvidia/configured-model" });
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIG" });
      expect(error instanceof Error ? error.message : "").toContain("Fixture mode was not substituted");
    }
  });

  it("requires an https NVIDIA base URL", () => {
    expect(() => loadConfig({ NVIDIA_BASE_URL: "http://integrate.api.nvidia.com/v1" })).toThrow(/https/);
  });
});
