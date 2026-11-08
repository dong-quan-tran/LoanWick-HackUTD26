import type { AnalysisSnapshot } from "@loanwick/contracts";
import type { DatabaseFindingInput } from "@loanwick/database-adapter";
import { toAnalysisSnapshot, type DatabaseWorkerSnapshot } from "@loanwick/database-adapter";

import type { WorkerConfig } from "../config/load-config.js";
import { WorkerRunError } from "../errors.js";
import { createProvider } from "../provider/create-provider.js";
import { runCaseInvestigation, type CaseRun } from "./run-case.js";

type Stamp = { toISOString(): string };

type CloudSnapshot = {
  id: string;
  applicationId: string;
  revisions: { applicationRevision: number; collateralRevision: number; paymentRevision: number };
  sources: { applicationId: string; revisions: { applicationRevision: number; collateralRevision: number; paymentRevision: number } }[];
  claimEpoch: number;
  executionMode: string;
  inputsCurrent: boolean;
  applications: {
    id: string;
    businessName: string;
    amountCents: bigint;
    currency: string;
    stage: string;
    revisions: { applicationRevision: number; collateralRevision: number; paymentRevision: number };
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

type CloudClient = {
  subscriptionBuilder(): SubscriptionBuilder;
  db: {
    myUser: { iter(): Iterable<{ role?: string }> };
    workerAvailableJobs: { iter(): Iterable<{ id: string; status: string }> };
    workerSnapshots: { iter(): Iterable<CloudSnapshot> };
    workerJobOutcomes: { iter(): Iterable<{ id: string; status: string; errorCode?: string; acceptedFindingIds: string[] }> };
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
  };
  disconnect(): void;
};

export async function runQueuedCloudJob(config: WorkerConfig, signal: AbortSignal): Promise<CaseRun & { jobId: string; outcome: string }> {
  const token = process.env.SPACETIMEDB_TOKEN?.trim() ?? "";
  const database = process.env.SPACETIMEDB_DATABASE?.trim() || "loanwick-hackutd26-dev";
  const uri = process.env.SPACETIMEDB_URI?.trim() || "https://maincloud.spacetimedb.com";
  if (token.length === 0) {
    throw new WorkerRunError("CONFIG", "SPACETIMEDB_TOKEN is required to claim a cloud job");
  }
  const client = await connect(uri, database, token);
  try {
    const user = [...client.db.myUser.iter()][0];
    if (user?.role !== "worker") {
      throw new WorkerRunError("CONFIG", "this token is not the worker role");
    }
    const job = [...client.db.workerAvailableJobs.iter()].find((item) => item.status === "queued");
    if (job === undefined) {
      throw new WorkerRunError("CONFIG", "no queued investigation is waiting");
    }
    await client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 120 });
    const snapshot = await waitFor(() => [...client.db.workerSnapshots.iter()].find((item) => item.id === job.id), "worker snapshot");
    if (!snapshot.inputsCurrent) {
      await client.reducers.failInvestigation({ jobId: job.id, claimEpoch: snapshot.claimEpoch, errorCode: "WORKER_ERROR" });
      throw new WorkerRunError("INVALID_ARGUMENTS", "the claimed snapshot is stale");
    }
    if (snapshot.executionMode === "live" && config.executionMode !== "live") {
      await client.reducers.failInvestigation({ jobId: job.id, claimEpoch: snapshot.claimEpoch, errorCode: "MODEL_UNAVAILABLE" });
      throw new WorkerRunError("CONFIG", "a live job requires AGENT_MODE=live");
    }
    let result: CaseRun;
    try {
      result = await runCaseInvestigation({
        provider: createProvider(config),
        snapshot: toSnapshot(snapshot),
        maxSteps: config.maxSteps,
        signal,
      });
    } catch (error) {
      await client.reducers.failInvestigation({
        jobId: job.id,
        claimEpoch: snapshot.claimEpoch,
        errorCode: failureCode(error),
      });
      throw error;
    }
    let sequence = 1;
    for (const event of result.toolEvents) {
      await client.reducers.recordToolEvent({
        jobId: job.id,
        claimEpoch: snapshot.claimEpoch,
        sequence,
        toolName: event.toolName,
        status: event.status,
        inputSummary: event.inputSummary,
        outputSummary: event.outputSummary,
        durationMs: Math.min(event.durationMs, 120_000),
      });
      sequence += 1;
    }
    await client.reducers.renewInvestigation({ jobId: job.id, claimEpoch: snapshot.claimEpoch, leaseSeconds: 60 });
    await client.reducers.completeInvestigation({
      jobId: job.id,
      claimEpoch: snapshot.claimEpoch,
      modelId: snapshot.executionMode === "live" && config.executionMode === "live" ? config.nvidiaModel : undefined,
      findings: result.findings,
    });
    const outcome = await waitFor(
      () => [...client.db.workerJobOutcomes.iter()].find((item) => item.id === job.id),
      "job outcome",
    );
    return { ...result, jobId: job.id, outcome: outcome.status };
  } finally {
    client.disconnect();
  }
}

function toSnapshot(row: CloudSnapshot): AnalysisSnapshot {
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

function failureCode(error: unknown): "MODEL_TIMEOUT" | "MODEL_UNAVAILABLE" | "INVALID_MODEL_OUTPUT" | "WORKER_ERROR" {
  if (!(error instanceof WorkerRunError)) {
    return "WORKER_ERROR";
  }
  if (error.code === "TIMEOUT") {
    return "MODEL_TIMEOUT";
  }
  if (error.code === "CONFIG" || error.code === "PROVIDER_ERROR") {
    return "MODEL_UNAVAILABLE";
  }
  if (error.code === "TOOL_REQUIRED" || error.code === "UNKNOWN_TOOL" || error.code === "INVALID_ARGUMENTS" || error.code === "EXCESSIVE_OUTPUT" || error.code === "MULTIPLE_TOOL_CALLS" || error.code === "STEP_BUDGET") {
    return "INVALID_MODEL_OUTPUT";
  }
  return "WORKER_ERROR";
}

async function connect(uri: string, database: string, token: string): Promise<CloudClient> {
  const bindings = new URL("../../../../spacetimedb/bindings/index.ts", import.meta.url);
  const mod = (await import(bindings.href)) as { DbConnection: { builder: () => DbBuilder } };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new WorkerRunError("TIMEOUT", "database connection timed out")), 20_000);
    mod.DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((client: CloudClient) => {
        client.subscriptionBuilder().onApplied(() => {
          clearTimeout(timer);
          resolve(client);
        }).onError(() => {
          clearTimeout(timer);
          reject(new WorkerRunError("PROVIDER_ERROR", "database subscription was rejected"));
        }).subscribe([
          "SELECT * FROM my_user",
          "SELECT * FROM worker_available_jobs",
          "SELECT * FROM worker_snapshots",
          "SELECT * FROM worker_job_outcomes",
        ]);
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
  onConnect(cb: (client: CloudClient & { subscriptionBuilder(): SubscriptionBuilder }) => void): DbBuilder;
  onConnectError(cb: () => void): DbBuilder;
  build(): void;
};

type SubscriptionBuilder = {
  onApplied(cb: () => void): SubscriptionBuilder;
  onError(cb: () => void): SubscriptionBuilder;
  subscribe(queries: string[]): void;
};

async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
  const end = Date.now() + 8_000;
  do {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < end);
  throw new WorkerRunError("TIMEOUT", `timed out waiting for ${label}`);
}
