import { WorkerRunError } from "../errors.js";
import type { CaseToolEvent } from "./case-tools.js";

export const TOOL_EVENT_STATUSES = ["started", "succeeded", "failed"] as const;
export type ToolEventStatus = (typeof TOOL_EVENT_STATUSES)[number];

export type DatabaseToolEvent = {
  sequence: number;
  toolName: string;
  status: ToolEventStatus;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
};

const TOOL_NAME = /^[A-Za-z0-9_-]{1,100}$/;

export function toDatabaseToolEvent(sequence: number, event: {
  toolName: string;
  status: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
}): DatabaseToolEvent {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 100) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "tool event sequence must be from 1 to 100");
  }
  if (!TOOL_EVENT_STATUSES.includes(event.status as ToolEventStatus)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "tool event status must be started, succeeded, or failed");
  }
  if (!TOOL_NAME.test(event.toolName)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "tool event name is not recordable");
  }
  for (const summary of [event.inputSummary, event.outputSummary]) {
    if (summary.length > 280 || /[\r\n]/.test(summary)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "tool event summary exceeds the database limit");
    }
  }
  if (!Number.isInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 120_000) {
    throw new WorkerRunError("TIMEOUT", "tool event duration exceeds 120000ms");
  }
  return {
    sequence,
    toolName: event.toolName,
    status: event.status as ToolEventStatus,
    inputSummary: event.inputSummary,
    outputSummary: event.outputSummary,
    durationMs: event.durationMs,
  };
}

export function assertContiguousSequences(events: readonly { sequence: number }[]): void {
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "tool event sequence must be contiguous from 1");
    }
  });
}

export function databaseToolEvents(events: readonly CaseToolEvent[]): DatabaseToolEvent[] {
  const rows = events.map((event, index) => toDatabaseToolEvent(index + 1, event));
  assertContiguousSequences(rows);
  return rows;
}
