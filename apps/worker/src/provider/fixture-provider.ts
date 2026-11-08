import { WorkerRunError } from "../errors.js";
import type { ChatMessage, ModelProvider, ProviderTurn, ToolDefinition } from "./types.js";

const FIXTURE_CALL_ID = "fixture-call-1";

export class FixtureProvider implements ModelProvider {
  readonly executionMode = "fixture" as const;
  readonly model = "fixture";

  async complete(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<ProviderTurn> {
    if (signal.aborted) {
      throw new WorkerRunError("TIMEOUT", "fixture provider aborted");
    }
    if (!tools.some((tool) => tool.name === "read_worker_clock")) {
      throw new WorkerRunError("UNKNOWN_TOOL", "fixture provider was not offered read_worker_clock");
    }

    const toolMessage = [...messages].reverse().find((message) => message.role === "tool");
    if (toolMessage === undefined) {
      return {
        model: this.model,
        message: {
          content: null,
          toolCalls: [{ id: FIXTURE_CALL_ID, name: "read_worker_clock", arguments: {} }],
        },
      };
    }

    return {
      model: this.model,
      message: {
        content: `executionMode=fixture tool=read_worker_clock output=${toolMessage.content}`,
        toolCalls: [],
      },
    };
  }
}
