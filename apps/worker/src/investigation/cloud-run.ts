import type { AnalysisSnapshot } from "@loanwick/contracts";
import { DatabaseAdapterError, toAnalysisSnapshot, type DatabaseFindingInput, type DatabaseWorkerSnapshot } from "@loanwick/database-adapter";

import type { WorkerConfig } from "../config/load-config.js";
import { WorkerRunError } from "../errors.js";
import { createProvider } from "../provider/create-provider.js";
import { databaseFindings, type CaseToolEvent } from "./case-tools.js";
import { type CaseRun, runCaseInvestigation } from "./run-case.js";
import { draftRequestId, templateForFinding } from "./drafts.js";
import { databaseToolEvents } from "./tool-events.js";

type Stamp = { toISOString(): string };

type RevisionVector = { applicationRevision: number; collateralRevision: number; paymentRevision: number };

export type WorkerViewSnapshot = {
  id: string;
  applicationId: string;
  revisions: RevisionVector;
  sources: { applicationId: string; revisions: RevisionVector }[];
  claimEpoch: number;
  executionMode: string;
  inputsCurrent: boolean;
  leaseExpiresAt?: Stamp;
  applications: {
    id: string;
    businessName: string;
    amountCents: bigint;
    currency: string;
    stage: string;
    revisions: RevisionVector;
  }[];
  documents: {
    id: string;
    applicationId: string;
    type: string;
    version: number;
    sha256: string;
    displayFilename: string;
    extractionStatus: string;
    uploadedBy: string;
    createdAt: Stamp;
  }[];
  evidence: {
    id: string;
    applicationId: string;
    documentId: string;
    documentVersion: number;
    pageNumber?: number;
    locator?: string;
    excerpt: string;
    fieldName?: string;
    fieldValue?: string;
    extractionMethod: string;
    createdAt: Stamp;
  }[];
  collateral: {
    id: string;
    applicationId: string;
    identifier: string;
    description: string;
    exclusiveOwnershipClaim: boolean;
    active: boolean;
    evidenceIds: string[];
  }[];
  relationships: {
    id: string;
    leftApplicationId: string;
    rightApplicationId: string;
    decision: string;
    evidenceIds: string[];
  }[];
};

export type AvailableJob = { id: string; status: string; claimEpoch?: number };

export type WorkerJobOutcome = {
  id: string;
  status: string;
  errorCode?: string;
  acceptedFindingIds: string[];
  claimEpoch: number;
};

type FailCode = "MODEL_TIMEOUT" | "MODEL_UNAVAILABLE" | "INVALID_MODEL_OUTPUT" | "EXTRACTION_UNSUPPORTED" | "WORKER_ERROR";

export type InvestigationClient = {
  subscriptionReady: boolean;
  db: {
    myUser: { iter(): Iterable<{ role?: string }> };
    workerAvailableJobs: { iter(): Iterable<AvailableJob> };
    workerSnapshots: { iter(): Iterable<WorkerViewSnapshot> };
    workerJobOutcomes: { iter(): Iterable<WorkerJobOutcome> };
  };
  reducers: {
    claimInvestigation(args: { jobId: string; leaseSeconds: number }): Promise<void>;
    renewInvestigation(args: { jobId: string; claimEpoch: number; leaseSeconds: number }): Promise<void>;
    recordToolEvent(args: {
      jobId: string;
      claimEpoch: number;
      sequence: number;
      toolName: string;
      status: string;
      inputSummary: string;
      outputSummary: string;
      durationMs: number;
    }): Promise<void>;
    completeInvestigation(args: {
      jobId: string;
      claimEpoch: number;
      modelId: string | undefined;
      findings: DatabaseFindingInput[];
    }): Promise<void>;
    failInvestigation(args: { jobId: string; claimEpoch: number; errorCode: string }): Promise<void>;
    createClarificationDraft?(args: { requestId: string; findingId: string; template: string }): Promise<void>;
  };
};

export type ClaimedInvestigation = CaseRun & {
  jobId: string;
  claimEpoch: number;
  modelId: string | undefined;
  outcome: string;
  drafts: { findingId: string; requestId: string; sent: false; state: "draft"; template: string }[];
  draftErrors: { findingId: string; message: string }[];
};

export const WORKER_VIEW_QUERIES = [
  "SELECT * FROM my_user",
  "SELECT * FROM worker_available_jobs",
  "SELECT * FROM worker_snapshots",
  "SELECT * FROM worker_job_outcomes",
] as const;

const PERMANENT_REDUCER = /LEASE_EXHAUSTED|LEASE_LOST|STALE_RESULTS|INVALID_INPUT|INVALID_EVIDENCE|NOT_FOUND_OR_FORBIDDEN|UNAUTHORIZED/;
const TRANSIENT_REDUCER = /temporarily unavailable|ETIMEDOUT|ECONNRESET|\b503\b|\b429\b/;

export async function runClaimedInvestigation(input: {
  client: InvestigationClient;
  config: WorkerConfig;
  signal: AbortSignal;
  now?: () => number;
  waitMs?: number;
  investigate?: (investigation: { snapshot: AnalysisSnapshot; maxSteps: number; signal: AbortSignal }) => Promise<CaseRun>;
}): Promise<ClaimedInvestigation> {
  const now = input.now ?? Date.now;
  const client = input.client;
  if (!client.subscriptionReady) {
    throw new WorkerRunError("CONFIG", "subscribe to worker views before claiming a job");
  }
  const user = [...client.db.myUser.iter()][0];
  if (user?.role !== "worker") {
    throw new WorkerRunError("CONFIG", "this token is not the worker role");
  }
  const job = pickQueued([...client.db.workerAvailableJobs.iter()]);
  await client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 120 });

  const claimed = copyClaim(await waitFor(
    () => [...client.db.workerSnapshots.iter()].find((item) => item.id === job.id),
    "worker snapshot",
    input.waitMs ?? 8_000,
  ));
  const epoch = claimed.claimEpoch;
  let terminal = false;
  let completed = false;

  const fail = async (code: FailCode) => {
    if (terminal) {
      return;
    }
    terminal = true;
    await client.reducers.failInvestigation({ jobId: job.id, claimEpoch: epoch, errorCode: code });
  };

  try {
    if (!claimed.inputsCurrent) {
      await fail("WORKER_ERROR");
      throw new WorkerRunError("STALE_RESULTS", "the claimed snapshot is stale");
    }
    const modelId = completionModelId(claimed, input.config);
    if (leaseExpired(claimed, now())) {
      await renewOrStop();
    }
    if (cancelled()) {
      throw new WorkerRunError("CANCELLED", "the officer cancelled this investigation");
    }
    if (input.signal.aborted) {
      throw new WorkerRunError("TIMEOUT", "case investigation timed out");
    }
    const analysis = analysisFrom(claimed);
    const result = await (input.investigate ?? defaultInvestigate)({
      snapshot: analysis,
      maxSteps: input.config.maxSteps,
      signal: input.signal,
    });
    const latest = currentSnapshot();
    if (cancelled()) {
      throw new WorkerRunError("CANCELLED", "the officer cancelled this investigation");
    }
    if (latest === undefined || latest.claimEpoch !== epoch) {
      throw new WorkerRunError("LEASE_LOST", "the claim epoch changed before completion");
    }
    if (!latest.inputsCurrent || !sameClaim(claimed, latest)) {
      await fail("WORKER_ERROR");
      throw new WorkerRunError("STALE_RESULTS", "the claimed snapshot changed before completion");
    }
    const authoritative = await databaseFindings(analysis);
    if (JSON.stringify(result.findings) !== JSON.stringify(authoritative)) {
      await fail("INVALID_MODEL_OUTPUT");
      throw new WorkerRunError("INVALID_ARGUMENTS", "refusing to store findings the deterministic check did not produce");
    }
    await recordEvents(result.toolEvents);
    await renewOrStop();
    if (cancelled()) {
      throw new WorkerRunError("CANCELLED", "the officer cancelled this investigation");
    }
    if (completed) {
      throw new WorkerRunError("CONFIG", "refusing to replay a completed investigation write");
    }
    const completion = { jobId: job.id, claimEpoch: epoch, modelId, findings: authoritative };
    try {
      await retrySame(() => client.reducers.completeInvestigation(completion));
    } catch (error) {
      if (reducerText(error).includes("STALE_RESULTS")) {
        await fail("WORKER_ERROR");
        throw new WorkerRunError("STALE_RESULTS", "the server rejected stale investigation results");
      }
      throw error;
    }
    completed = true;
    const outcome = await waitFor(
      () => [...client.db.workerJobOutcomes.iter()].find((item) => item.id === job.id),
      "job outcome",
      input.waitMs ?? 8_000,
    );
    const drafted = outcome.status === "succeeded"
      ? await draftFindings(result, outcome.acceptedFindingIds)
      : { drafts: [], draftErrors: [] };
    return {
      ...result,
      findings: authoritative,
      jobId: job.id,
      claimEpoch: epoch,
      modelId,
      outcome: outcome.status,
      ...drafted,
    };
  } catch (error) {
    if (terminal || (error instanceof WorkerRunError && (error.code === "CANCELLED" || error.code === "LEASE_LOST"))) {
      throw error;
    }
    await recordIfPossible(error);
    await fail(failureCode(error));
    throw error;
  }

  async function renewOrStop(): Promise<void> {
    try {
      await retrySame(() => client.reducers.renewInvestigation({ jobId: job.id, claimEpoch: epoch, leaseSeconds: 60 }));
    } catch (error) {
      if (reducerText(error).includes("LEASE_EXHAUSTED")) {
        await fail("WORKER_ERROR");
        throw new WorkerRunError("LEASE_EXHAUSTED", "the investigation lease is exhausted");
      }
      if (reducerText(error).includes("LEASE_LOST")) {
        throw new WorkerRunError("LEASE_LOST", "the investigation lease was lost");
      }
      throw error;
    }
  }

  function cancelled(): boolean {
    return [...client.db.workerJobOutcomes.iter()].some((item) => item.id === job.id && item.status === "cancelled");
  }

  function currentSnapshot(): WorkerViewSnapshot | undefined {
    return [...client.db.workerSnapshots.iter()].find((item) => item.id === job.id);
  }

  async function recordEvents(events: readonly CaseToolEvent[]): Promise<void> {
    for (const row of databaseToolEvents(events)) {
      const args = { jobId: job.id, claimEpoch: epoch, ...row };
      await retrySame(() => client.reducers.recordToolEvent(args));
    }
  }

  async function recordIfPossible(error: unknown): Promise<void> {
    if (!(error instanceof WorkerRunError) || error.partialEvents === undefined || error.partialEvents.length === 0) {
      return;
    }
    try {
      await recordEvents(error.partialEvents);
    } catch {
      // The terminal failure is recorded separately. One bad event must not skip it.
    }
  }

  async function draftFindings(result: CaseRun, findingIds: readonly string[]) {
    const drafts: ClaimedInvestigation["drafts"] = [];
    const draftErrors: ClaimedInvestigation["draftErrors"] = [];
    for (let index = 0; index < findingIds.length; index += 1) {
      const findingId = findingIds[index];
      if (findingId === undefined) {
        continue;
      }
      const template = result.clarificationTemplate ?? templateForFinding(result.findings[index]?.type);
      const requestId = draftRequestId(job.id, findingId);
      try {
        if (client.reducers.createClarificationDraft === undefined) {
          throw new Error("clarification draft reducer is unavailable");
        }
        await client.reducers.createClarificationDraft({ requestId, findingId, template });
        drafts.push({ findingId, requestId, sent: false, state: "draft", template });
      } catch (error) {
        draftErrors.push({ findingId, message: error instanceof Error ? error.message : "draft failed" });
      }
    }
    return { drafts, draftErrors };
  }

  function defaultInvestigate(investigation: { snapshot: AnalysisSnapshot; maxSteps: number; signal: AbortSignal }) {
    return runCaseInvestigation({
      provider: createProvider(input.config),
      snapshot: investigation.snapshot,
      maxSteps: investigation.maxSteps,
      signal: investigation.signal,
    });
  }
}

export async function runQueuedCloudJob(config: WorkerConfig, signal: AbortSignal): Promise<ClaimedInvestigation> {
  const token = process.env.SPACETIMEDB_TOKEN?.trim() ?? "";
  const database = process.env.SPACETIMEDB_DATABASE?.trim() || "loanwick-hackutd26-dev";
  const uri = process.env.SPACETIMEDB_URI?.trim() || "https://maincloud.spacetimedb.com";
  if (token.length === 0) {
    throw new WorkerRunError("CONFIG", "SPACETIMEDB_TOKEN is required to claim a cloud job");
  }
  const client = await connect(uri, database, token);
  try {
    return await runClaimedInvestigation({ client, config, signal });
  } finally {
    client.disconnect();
  }
}

function pickQueued(jobs: readonly AvailableJob[]): AvailableJob {
  const queued = jobs.filter((job) => job.status === "queued");
  const usable = queued.filter((job) => job.claimEpoch === undefined || job.claimEpoch < 3);
  const next = usable[0];
  if (next !== undefined) {
    return next;
  }
  if (queued.some((job) => job.claimEpoch !== undefined && job.claimEpoch >= 3)) {
    throw new WorkerRunError("LEASE_EXHAUSTED", "a claim epoch of 3 or more permanently fails the job");
  }
  throw new WorkerRunError("CONFIG", "no queued investigation is waiting");
}

function completionModelId(snapshot: WorkerViewSnapshot, config: WorkerConfig): string | undefined {
  if (snapshot.executionMode === "live") {
    if (config.executionMode !== "live" || config.nvidiaModel.trim().length === 0) {
      throw new WorkerRunError("CONFIG", "a live job requires AGENT_MODE=live");
    }
    return config.nvidiaModel;
  }
  if (snapshot.executionMode !== "fixture") {
    throw new WorkerRunError("CONFIG", "investigation execution mode is not live or fixture");
  }
  return undefined;
}

function leaseExpired(snapshot: WorkerViewSnapshot, nowMs: number): boolean {
  if (snapshot.leaseExpiresAt === undefined) {
    return false;
  }
  const expires = Date.parse(snapshot.leaseExpiresAt.toISOString());
  return Number.isFinite(expires) && nowMs >= expires;
}

function copyClaim(row: WorkerViewSnapshot): WorkerViewSnapshot {
  return {
    ...row,
    revisions: { ...row.revisions },
    sources: row.sources.map((source) => ({ applicationId: source.applicationId, revisions: { ...source.revisions } })),
  };
}

function sameClaim(left: WorkerViewSnapshot, right: WorkerViewSnapshot): boolean {
  return JSON.stringify(left.revisions) === JSON.stringify(right.revisions)
    && JSON.stringify(left.sources) === JSON.stringify(right.sources);
}

function analysisFrom(row: WorkerViewSnapshot): AnalysisSnapshot {
  try {
    return toSnapshot(row);
  } catch (error) {
    if (error instanceof DatabaseAdapterError) {
      throw new WorkerRunError(error.code === "STALE_RESULTS" ? "STALE_RESULTS" : "INVALID_ARGUMENTS", error.message);
    }
    throw error;
  }
}

function failureCode(error: unknown): FailCode {
  if (!(error instanceof WorkerRunError)) {
    return "WORKER_ERROR";
  }
  if (error.code === "TIMEOUT") {
    return "MODEL_TIMEOUT";
  }
  if (error.code === "CONFIG" || error.code === "PROVIDER_ERROR") {
    return "MODEL_UNAVAILABLE";
  }
  if (
    error.code === "TOOL_REQUIRED"
    || error.code === "UNKNOWN_TOOL"
    || error.code === "INVALID_ARGUMENTS"
    || error.code === "EXCESSIVE_OUTPUT"
    || error.code === "MULTIPLE_TOOL_CALLS"
    || error.code === "STEP_BUDGET"
  ) {
    return "INVALID_MODEL_OUTPUT";
  }
  return "WORKER_ERROR";
}

function reducerText(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

async function retrySame(run: () => Promise<void>): Promise<void> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      last = error;
      const message = reducerText(error);
      if (PERMANENT_REDUCER.test(message) || !TRANSIENT_REDUCER.test(message) || attempt === 3) {
        throw error;
      }
    }
  }
  throw last;
}

function toSnapshot(row: WorkerViewSnapshot): AnalysisSnapshot {
  const raw: DatabaseWorkerSnapshot = {
    id: row.id,
    applicationId: row.applicationId,
    inputsCurrent: row.inputsCurrent,
    revisions: row.revisions,
    sources: row.sources,
    applications: row.applications,
    documents: row.documents,
    evidence: row.evidence.map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      documentId: item.documentId,
      documentVersion: item.documentVersion,
      excerpt: item.excerpt,
      extractionMethod: item.extractionMethod,
      createdAt: item.createdAt,
      ...(item.pageNumber === undefined ? {} : { pageNumber: item.pageNumber }),
      ...(item.locator === undefined ? {} : { locator: item.locator }),
      ...(item.fieldName === undefined ? {} : { fieldName: item.fieldName }),
      ...(item.fieldValue === undefined ? {} : { fieldValue: item.fieldValue }),
    })),
    collateral: row.collateral,
    relationships: row.relationships,
  };
  return toAnalysisSnapshot(raw, { assetTypeNamespace: "equipment" });
}

type CloudConnection = InvestigationClient & { disconnect(): void };

async function connect(uri: string, database: string, token: string): Promise<CloudConnection> {
  const bindings = new URL("../../../../spacetimedb/bindings/index.ts", import.meta.url);
  const mod = (await import(bindings.href)) as { DbConnection: { builder: () => DbBuilder } };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new WorkerRunError("TIMEOUT", "database connection timed out")), 20_000);
    mod.DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((connected) => {
        const client = connected as CloudConnection & { subscriptionBuilder(): SubscriptionBuilder };
        client.subscriptionBuilder().onApplied(() => {
          clearTimeout(timer);
          // The subscription is applied before any claim. runClaimedInvestigation checks the flag.
          resolve(Object.assign(client, { subscriptionReady: true }));
        }).onError(() => {
          clearTimeout(timer);
          reject(new WorkerRunError("PROVIDER_ERROR", "database subscription was rejected"));
        }).subscribe([...WORKER_VIEW_QUERIES]);
      })
      .onConnectError(() => {
        clearTimeout(timer);
        reject(new WorkerRunError("PROVIDER_ERROR", "database connection failed"));
      })
      .build();
  });
}

type DbBuilder = {
  withUri(uri: string): DbBuilder;
  withDatabaseName(name: string): DbBuilder;
  withToken(token: string): DbBuilder;
  onConnect(cb: (client: CloudConnection & { subscriptionBuilder(): SubscriptionBuilder }) => void): DbBuilder;
  onConnectError(cb: () => void): DbBuilder;
  build(): void;
};

type SubscriptionBuilder = {
  onApplied(cb: () => void): SubscriptionBuilder;
  onError(cb: () => void): SubscriptionBuilder;
  subscribe(queries: string[]): void;
};

async function waitFor<T>(read: () => T | undefined, label: string, waitMs: number): Promise<T> {
  const end = Date.now() + waitMs;
  do {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < end);
  throw new WorkerRunError("TIMEOUT", `timed out waiting for ${label}`);
}
