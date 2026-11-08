export type WorkerErrorCode =
  | "CONFIG"
  | "UNKNOWN_TOOL"
  | "INVALID_ARGUMENTS"
  | "MULTIPLE_TOOL_CALLS"
  | "STEP_BUDGET"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "EXCESSIVE_OUTPUT"
  | "TOOL_REQUIRED"
  | "LEASE_EXHAUSTED"
  | "LEASE_LOST"
  | "STALE_RESULTS"
  | "CANCELLED";

export type RecordedRunEvent = {
  toolName: string;
  status: "succeeded" | "failed";
  inputSummary: string;
  outputSummary: string;
  modelContent: string;
  durationMs: number;
};

export class WorkerRunError extends Error {
  readonly code: WorkerErrorCode;
  readonly partialEvents: readonly RecordedRunEvent[] | undefined;

  constructor(code: WorkerErrorCode, message: string, partialEvents?: readonly RecordedRunEvent[]) {
    super(message);
    this.name = "WorkerRunError";
    this.code = code;
    this.partialEvents = partialEvents;
  }
}
