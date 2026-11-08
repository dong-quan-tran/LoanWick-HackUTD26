import { describe, expect, it } from "vitest";

import { WorkerRunError } from "../src/errors.js";
import { FixtureProvider } from "../src/provider/fixture-provider.js";
import { runToolSmoke } from "../src/provider/run-tool-smoke.js";
import type { ChatMessage, ModelProvider, ProviderTurn, ToolDefinition } from "../src/provider/types.js";

const NOW = "2026-11-08T04:00:00.000Z";

describe("runToolSmoke", () => {
  it("runs the clock through the fixture provider", async () => {
    const result = await runToolSmoke({
      provider: new FixtureProvider(),
      now: () => NOW,
      maxSteps: 8,
      timeoutMs: 5_000,
    });
    expect(result).toMatchObject({
      executionMode: "fixture",
      model: "fixture",
      toolName: "read_worker_clock",
      toolOutput: { utc: NOW },
      connectedDatabase: false,
      steps: 2,
    });
    expect(result.assistantSummary).toContain(NOW);
    expect(result.assistantSummary).toContain("executionMode=fixture");
  });

  it("keeps a live provider failure live", async () => {
    const provider: ModelProvider = {
      executionMode: "live",
      model: "nvidia/configured-model",
      complete() {
        return Promise.reject(new WorkerRunError("PROVIDER_ERROR", "upstream down"));
      },
    };
    await expect(
      runToolSmoke({ provider, now: () => NOW, maxSteps: 8, timeoutMs: 5_000 }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("rejects an unknown tool before executing it", async () => {
    await expect(
      runToolSmoke({
        provider: scripted([turn([{ id: "1", name: "shell", arguments: {} }])]),
        now: () => NOW,
        maxSteps: 4,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("rejects arguments on the clock tool", async () => {
    await expect(
      runToolSmoke({
        provider: scripted([turn([{ id: "1", name: "read_worker_clock", arguments: { path: "x" } }])]),
        now: () => NOW,
        maxSteps: 4,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("rejects more than one tool call", async () => {
    await expect(
      runToolSmoke({
        provider: scripted([
          turn([
            { id: "1", name: "read_worker_clock", arguments: {} },
            { id: "2", name: "read_worker_clock", arguments: {} },
          ]),
        ]),
        now: () => NOW,
        maxSteps: 4,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "MULTIPLE_TOOL_CALLS" });
  });

  it("stops at the step budget", async () => {
    await expect(
      runToolSmoke({
        provider: new FixtureProvider(),
        now: () => NOW,
        maxSteps: 1,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "STEP_BUDGET" });
  });

  it("rejects an answer that skipped the tool", async () => {
    await expect(
      runToolSmoke({
        provider: scripted([turn([])]),
        now: () => NOW,
        maxSteps: 4,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "TOOL_REQUIRED" });
  });
});

function turn(toolCalls: ProviderTurn["message"]["toolCalls"], content: string | null = null): ProviderTurn {
  return { model: "scripted", message: { content, toolCalls } };
}

function scripted(turns: ProviderTurn[]): ModelProvider {
  const pending = [...turns];
  return {
    executionMode: "live",
    model: "scripted",
    complete(messages: readonly ChatMessage[], tools: readonly ToolDefinition[]): Promise<ProviderTurn> {
      expect(tools.map((tool) => tool.name)).toEqual(["read_worker_clock"]);
      expect(messages[0]?.role).toBe("system");
      const next = pending.shift();
      if (next === undefined) {
        throw new Error("scripted provider ran out of turns");
      }
      return Promise.resolve(next);
    },
  };
}
