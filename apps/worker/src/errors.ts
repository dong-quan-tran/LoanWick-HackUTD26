export type WorkerErrorCode =
  | "CONFIG"
  | "UNKNOWN_TOOL"
  | "INVALID_ARGUMENTS"
  | "MULTIPLE_TOOL_CALLS"
  | "STEP_BUDGET"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "EXCESSIVE_OUTPUT"
  | "TOOL_REQUIRED";

export class WorkerRunError extends Error {
  readonly code: WorkerErrorCode;

  constructor(code: WorkerErrorCode, message: string) {
    super(message);
    this.name = "WorkerRunError";
    this.code = code;
  }
}
