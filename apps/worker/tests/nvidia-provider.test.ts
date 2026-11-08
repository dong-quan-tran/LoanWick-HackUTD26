import { describe, expect, it } from "vitest";

import { WorkerRunError } from "../src/errors.js";
import { NvidiaProvider } from "../src/provider/nvidia-provider.js";
import { readWorkerClockDefinition } from "../src/tools/read-worker-clock.js";

const KEY = "nvapi-unit-test-secret";

describe("NvidiaProvider", () => {
  it("posts the documented chat-completions tool request", async () => {
    const seen: { url: string; body: Record<string, unknown>; authorization: string } = {
      url: "",
      body: {},
      authorization: "",
    };
    const fetchImpl: typeof fetch = (input, init) => {
      seen.url = String(input);
      seen.authorization = new Headers(init?.headers).get("authorization") ?? "";
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const payload = {
        model: "nvidia/configured-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "read_worker_clock", arguments: "{}" },
                },
              ],
            },
          },
        ],
      };
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    };

    const provider = new NvidiaProvider({
      apiKey: KEY,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/configured-model",
      fetchImpl,
    });
    const turn = await provider.complete(
      [{ role: "system", content: "call the clock" }],
      [readWorkerClockDefinition],
      new AbortController().signal,
    );

    expect(seen.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(seen.authorization).toBe(`Bearer ${KEY}`);
    expect(seen.body).toMatchObject({
      model: "nvidia/configured-model",
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_tokens: 512,
      temperature: 0,
      stream: false,
      messages: [{ role: "system", content: "call the clock" }],
    });
    expect(JSON.stringify(seen.body)).not.toContain("api.meta.ai");
    expect(turn.model).toBe("nvidia/configured-model");
    expect(turn.message.toolCalls).toEqual([
      { id: "call_1", name: "read_worker_clock", arguments: {} },
    ]);
    expect(seen.body).not.toHaveProperty("reasoning_budget");
    expect(seen.body).not.toHaveProperty("top_p");
  });

  it("sends the omni reasoning sample fields when configured", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
      );
    };
    const provider = new NvidiaProvider({
      apiKey: KEY,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      maxTokens: 4096,
      temperature: 0.6,
      topP: 0.95,
      reasoningBudget: 2048,
      fetchImpl,
    });
    await provider.complete([{ role: "user", content: "hi" }], [], new AbortController().signal);
    expect(body).toMatchObject({
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      max_tokens: 4096,
      temperature: 0.6,
      top_p: 0.95,
      reasoning_budget: 2048,
      stream: false,
    });
  });

  it("redacts the key from an error body and does not become fixture", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response(`unauthorized ${KEY}`, { status: 401 }));
    const provider = new NvidiaProvider({
      apiKey: KEY,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/configured-model",
      fetchImpl,
    });

    await expect(
      provider.complete([{ role: "user", content: "hi" }], [readWorkerClockDefinition], new AbortController().signal),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });

    try {
      await provider.complete(
        [{ role: "user", content: "hi" }],
        [readWorkerClockDefinition],
        new AbortController().signal,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerRunError);
      expect(error instanceof Error ? error.message : "").not.toContain(KEY);
      expect(error instanceof Error ? error.message : "").toContain("[redacted]");
      expect(provider.executionMode).toBe("live");
    }
  });
});
