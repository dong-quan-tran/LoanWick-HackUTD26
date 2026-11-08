import { WorkerRunError } from "../errors.js";
import type { ToolDefinition } from "../provider/types.js";

export const READ_WORKER_CLOCK = "read_worker_clock";

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const readWorkerClockDefinition: ToolDefinition = {
  name: READ_WORKER_CLOCK,
  description:
    "Return this worker process's current UTC time. It reads no files and calls no network.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

export function executeReadWorkerClock(args: unknown, now: () => string): { utc: string } {
  if (!isEmptyRecord(args)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "read_worker_clock accepts no arguments");
  }
  const utc = now();
  if (!UTC_TIMESTAMP.test(utc)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "clock did not return a UTC timestamp");
  }
  return { utc };
}

function isEmptyRecord(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).length === 0;
}
