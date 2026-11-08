export type ExecutionMode = "live" | "fixture";

export type ToolParameters = {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  additionalProperties: false;
  required?: readonly string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameters;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ProviderTurn = {
  model: string;
  message: {
    content: string | null;
    toolCalls: ToolCall[];
  };
};

export interface ModelProvider {
  readonly executionMode: ExecutionMode;
  readonly model: string;
  complete(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<ProviderTurn>;
}
