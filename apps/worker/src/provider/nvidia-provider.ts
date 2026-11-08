import { WorkerRunError } from "../errors.js";
import { redactSecrets, truncate } from "../security/redact.js";
import type { ChatMessage, ModelProvider, ProviderTurn, ToolCall, ToolDefinition } from "./types.js";

const MAX_ERROR_BODY = 500;

type NvidiaProviderOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  reasoningBudget?: number;
  fetchImpl?: typeof fetch;
};

export class NvidiaProvider implements ModelProvider {
  readonly executionMode = "live" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly topP: number | undefined;
  private readonly reasoningBudget: number | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NvidiaProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.maxTokens = options.maxTokens ?? 512;
    this.temperature = options.temperature ?? 0;
    this.topP = options.topP;
    this.reasoningBudget = options.reasoningBudget;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<ProviderTurn> {
    if (signal.aborted) {
      throw new WorkerRunError("TIMEOUT", "NVIDIA request aborted");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((message) => toApiMessage(message)),
          tools: tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: "auto",
          parallel_tool_calls: false,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          stream: false,
          ...(this.topP === undefined ? {} : { top_p: this.topP }),
          ...(this.reasoningBudget === undefined ? {} : { reasoning_budget: this.reasoningBudget }),
        }),
      });
    } catch (error) {
      if (signal.aborted) {
        throw new WorkerRunError("TIMEOUT", "NVIDIA request aborted");
      }
      const detail = error instanceof Error ? error.message : "network failure";
      throw new WorkerRunError("PROVIDER_ERROR", this.safe(`NVIDIA request failed: ${detail}`));
    }

    const body = await response.text();
    if (!response.ok) {
      throw new WorkerRunError(
        "PROVIDER_ERROR",
        this.safe(`NVIDIA chat completions returned ${response.status}: ${truncate(body, MAX_ERROR_BODY)}`),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA chat completions returned non-JSON");
    }
    return parseTurn(parsed, this.model);
  }

  private safe(text: string): string {
    return redactSecrets(text, [this.apiKey]);
  }
}

function toApiMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  if (message.role === "assistant") {
    const apiMessage: Record<string, unknown> = {
      role: "assistant",
      content: message.content,
    };
    if (message.toolCalls.length > 0) {
      apiMessage.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }
    return apiMessage;
  }
  return {
    role: message.role,
    content: message.content,
  };
}

function parseTurn(payload: unknown, fallbackModel: string): ProviderTurn {
  if (payload === null || typeof payload !== "object") {
    throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA response was not an object");
  }
  const record = payload as Record<string, unknown>;
  const model = typeof record.model === "string" && record.model.length > 0 ? record.model : fallbackModel;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA response did not include a choice");
  }
  const choice = choices[0];
  if (choice === null || typeof choice !== "object") {
    throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA choice was not an object");
  }
  const message = (choice as Record<string, unknown>).message;
  if (message === null || typeof message !== "object") {
    throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA choice did not include a message");
  }
  const messageRecord = message as Record<string, unknown>;
  return {
    model,
    message: {
      content: readContent(messageRecord.content),
      toolCalls: readToolCalls(messageRecord.tool_calls),
    },
  };
}

function readContent(content: unknown): string | null {
  if (content === null || content === undefined) {
    return null;
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part !== null && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
    return text.length > 0 ? text : null;
  }
  throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA message content had an unexpected shape");
}

function readToolCalls(raw: unknown): ToolCall[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA tool_calls was not an array");
  }
  return raw.map((item) => {
    if (item === null || typeof item !== "object") {
      throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA tool call was not an object");
    }
    const call = item as Record<string, unknown>;
    const id = call.id;
    const fn = call.function;
    if (typeof id !== "string" || id.length === 0) {
      throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA tool call was missing an id");
    }
    if (fn === null || typeof fn !== "object") {
      throw new WorkerRunError("PROVIDER_ERROR", "NVIDIA tool call was missing a function");
    }
    const name = (fn as Record<string, unknown>).name;
    if (typeof name !== "string" || name.length === 0) {
      throw new WorkerRunError("UNKNOWN_TOOL", "NVIDIA tool call was missing a name");
    }
    return {
      id,
      name,
      arguments: parseArguments((fn as Record<string, unknown>).arguments),
    };
  });
}

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") {
    throw new WorkerRunError("INVALID_ARGUMENTS", "NVIDIA tool arguments were not a JSON string");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new WorkerRunError("INVALID_ARGUMENTS", "NVIDIA tool arguments were not JSON");
  }
}
