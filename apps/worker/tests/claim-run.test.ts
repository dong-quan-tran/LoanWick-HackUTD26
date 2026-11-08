import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnalysisSnapshot } from "@loanwick/contracts";
import type { DatabaseFindingInput } from "@loanwick/database-adapter";

import type { WorkerConfig } from "../src/config/load-config.js";
import { databaseFindings, safeToolSummary } from "../src/investigation/case-tools.js";
import {
  runClaimedInvestigation,
  type AvailableJob,
  type InvestigationClient,
  type WorkerJobOutcome,
  type WorkerViewSnapshot,
} from "../src/investigation/cloud-run.js";
import type { CaseRun } from "../src/investigation/run-case.js";
import { assertContiguousSequences, toDatabaseToolEvent } from "../src/investigation/tool-events.js";
import { fixture } from "../../../tests/helpers.js";

const fixtureConfig: WorkerConfig = {
  executionMode: "fixture",
  maxSteps: 8,
  timeoutMs: 30_000,
  uploadDir: "var/uploads",
  nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
};

const liveConfig: WorkerConfig = {
  executionMode: "live",
  maxSteps: 8,
  timeoutMs: 30_000,
  uploadDir: "var/uploads",
  nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
  nvidiaApiKey: "unit-test-key",
  nvidiaModel: "nvidia/unit-model",
  maxTokens: 512,
  temperature: 0,
};

const workerSource = readFileSync(fileURLToPath(new URL("../src/investigation/cloud-run.ts", import.meta.url)), "utf8");

class MemoryClient implements InvestigationClient {
  subscriptionReady = true;
  roleName = "worker";
  jobs: AvailableJob[] = [{ id: "job-1", status: "queued" }];
  snaps: WorkerViewSnapshot[];
  outcomes: WorkerJobOutcome[] = [];
  claims = 0;
  events: { sequence: number; status: string; inputSummary: string; outputSummary: string; durationMs: number }[] = [];
  completions: { modelId: string | undefined; titles: string[] }[] = [];
  failures: string[] = [];
  drafts: { template: string; findingId: string }[] = [];
  order: string[] = [];
  claimError: Error | undefined;
  renewError: Error | undefined;
  completeError: Error | undefined;
  completeFailures = 0;
  draftError: Error | undefined;

  readonly db: InvestigationClient["db"];
  readonly reducers: InvestigationClient["reducers"];

  constructor(snap: WorkerViewSnapshot) {
    this.snaps = [{ ...snap, id: "job-2", applicationId: "app-other" }, snap];
    this.db = {
      myUser: { iter: () => [{ role: this.roleName }] },
      workerAvailableJobs: { iter: () => this.jobs },
      workerSnapshots: { iter: () => this.snaps },
      workerJobOutcomes: { iter: () => this.outcomes },
    };
    this.reducers = {
      claimInvestigation: async () => {
        this.order.push("claim");
        this.claims += 1;
        if (this.claimError !== undefined) {
          throw this.claimError;
        }
      },
      renewInvestigation: async () => {
        this.order.push("renew");
        if (this.renewError !== undefined) {
          throw this.renewError;
        }
      },
      recordToolEvent: async (args) => {
        this.order.push("event");
        this.events.push(args);
      },
      completeInvestigation: async (args) => {
        this.order.push("complete");
        this.completions.push({ modelId: args.modelId, titles: args.findings.map((finding) => finding.title) });
        if (this.completeFailures > 0) {
          this.completeFailures -= 1;
          throw new Error("temporarily unavailable");
        }
        if (this.completeError !== undefined) {
          throw this.completeError;
        }
        this.outcomes.push({
          id: args.jobId,
          status: "succeeded",
          acceptedFindingIds: args.findings.map((_, index) => `finding-${index + 1}`),
          claimEpoch: args.claimEpoch,
        });
      },
      failInvestigation: async (args) => {
        this.order.push("fail");
        this.failures.push(args.errorCode);
      },
      createClarificationDraft: async (args) => {
        if (this.draftError !== undefined) {
          throw this.draftError;
        }
        this.drafts.push({ template: args.template, findingId: args.findingId });
      },
    };
  }
}

function excavatorView(): WorkerViewSnapshot {
  const full = fixture("app-excavator-a") as AnalysisSnapshot;
  const keep = new Set(["app-excavator-a", "app-excavator-b"]);
  const applications = full.applications.filter((application) => keep.has(application.id));
  const target = applications.find((application) => application.id === "app-excavator-a");
  if (target === undefined) {
    throw new Error("demo fixture is missing app-excavator-a");
  }
  const stamp = { toISOString: () => "2026-11-07T12:00:00.000Z" };
  const revisions = (application: typeof target) => ({
    applicationRevision: application.applicationRevision,
    collateralRevision: application.collateralRevision,
    paymentRevision: application.paymentRevision,
  });
  const needed = new Set([
    "ev-excavator-a-identifier",
    "ev-excavator-a-ownership",
    "ev-excavator-b-identifier",
    "ev-excavator-b-ownership",
  ]);
  return {
    id: "job-1",
    applicationId: "app-excavator-a",
    revisions: revisions(target),
    sources: applications
      .filter((application) => application.id !== "app-excavator-a")
      .map((application) => ({ applicationId: application.id, revisions: revisions(application) })),
    claimEpoch: 1,
    executionMode: "fixture",
    inputsCurrent: true,
    leaseExpiresAt: { toISOString: () => "2099-01-01T00:00:00.000Z" },
    applications: applications.map((application) => ({
      id: application.id,
      businessName: application.businessName,
      amountCents: BigInt(application.amountCents),
      currency: application.currency,
      stage: application.stage,
      revisions: revisions(application),
    })),
    documents: full.documents.filter((document) => keep.has(document.applicationId)).map((document) => ({
      ...document,
      createdAt: stamp,
    })),
    evidence: full.evidence.filter((item) => needed.has(item.id)).map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      documentId: item.documentId,
      documentVersion: item.documentVersion,
      excerpt: item.excerpt,
      extractionMethod: item.extractionMethod,
      createdAt: stamp,
      ...(item.locator === null ? {} : { locator: item.locator }),
      ...(item.fieldName === null ? {} : { fieldName: item.fieldName }),
      ...(item.extractedValue === null ? {} : { fieldValue: item.extractedValue }),
    })),
    collateral: full.collateral.filter((item) => keep.has(item.applicationId)).map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      identifier: item.identifier ?? "",
      description: item.description,
      exclusiveOwnershipClaim: item.exclusiveOwnershipClaim === true,
      active: item.active,
      evidenceIds: [...item.evidenceIds, ...item.ownershipEvidenceIds],
    })),
    relationships: [],
  };
}

function run(client: MemoryClient, config: WorkerConfig = fixtureConfig, investigate?: (investigation: {
  snapshot: AnalysisSnapshot;
  maxSteps: number;
  signal: AbortSignal;
}) => Promise<CaseRun>) {
  return runClaimedInvestigation({
    client,
    config,
    signal: new AbortController().signal,
    now: () => Date.parse("2026-11-08T00:00:00.000Z"),
    waitMs: 200,
    ...(investigate === undefined ? {} : { investigate }),
  });
}

async function checkedRun(snapshot: AnalysisSnapshot): Promise<CaseRun> {
  const findings = await databaseFindings(snapshot);
  return {
    executionMode: "fixture",
    model: "fixture",
    findings,
    toolEvents: [],
    assistantSummary: findings.map((finding) => finding.title).join(" "),
  };
}

describe("claimed investigation session", () => {
  it("claims one subscribed job, records bounded events, and stores deterministic findings", async () => {
    const client = new MemoryClient(excavatorView());
    const result = await run(client);
    expect(client.claims).toBe(1);
    expect(client.order[0]).toBe("claim");
    expect(client.order.indexOf("claim")).toBeLessThan(client.order.indexOf("event"));
    expect(client.order.indexOf("event")).toBeLessThan(client.order.indexOf("complete"));
    expect(client.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    for (const event of client.events) {
      expect(["started", "succeeded", "failed"]).toContain(event.status);
      expect(event.inputSummary.length).toBeLessThanOrEqual(280);
      expect(event.outputSummary.length).toBeLessThanOrEqual(280);
      expect(event.inputSummary).not.toMatch(/[\r\n]/);
      expect(event.outputSummary).not.toMatch(/[\r\n]/);
      expect(event.durationMs).toBeLessThanOrEqual(120_000);
    }
    expect(result.modelId).toBeUndefined();
    expect(client.completions).toHaveLength(1);
    expect(client.completions[0]?.modelId).toBeUndefined();
    expect(result.findings.some((finding) => finding.type === "collateral_conflict")).toBe(true);
    expect(result.findings.some((finding) => finding.relatedApplicationIds.includes("app-excavator-b"))).toBe(true);
    expect(result.outcome).toBe("succeeded");
    expect(result.drafts[0]).toMatchObject({ sent: false, state: "draft", template: "collateral" });
    expect(client.drafts).toHaveLength(result.findings.length);
    expect(JSON.stringify(client.completions)).not.toContain("unit-test-key");
    expect(workerSource).not.toContain("sendClarification");
    expect(workerSource).not.toContain("decideFinding");
  });

  it("refuses to claim before subscribe, without the worker role, or at claim epoch 3", async () => {
    const closed = new MemoryClient(excavatorView());
    closed.subscriptionReady = false;
    await expect(run(closed)).rejects.toThrow(/subscribe/);
    expect(closed.claims).toBe(0);

    const officer = new MemoryClient(excavatorView());
    officer.roleName = "officer";
    await expect(run(officer)).rejects.toThrow(/worker role/);
    expect(officer.claims).toBe(0);

    const exhausted = new MemoryClient(excavatorView());
    exhausted.jobs = [{ id: "job-1", status: "queued", claimEpoch: 3 }];
    await expect(run(exhausted)).rejects.toMatchObject({ code: "LEASE_EXHAUSTED" });
    expect(exhausted.claims).toBe(0);
    expect(exhausted.failures).toEqual([]);

    const renewed = new MemoryClient(excavatorView());
    renewed.renewError = new Error("LEASE_EXHAUSTED");
    await expect(run(renewed)).rejects.toMatchObject({ code: "LEASE_EXHAUSTED" });
    expect(renewed.claims).toBe(1);
    expect(renewed.completions).toEqual([]);
    expect(renewed.failures).toEqual(["WORKER_ERROR"]);
  });

  it("fails a stale snapshot instead of completing it", async () => {
    const client = new MemoryClient(excavatorView());
    const snap = client.snaps[1];
    if (snap === undefined) {
      throw new Error("missing snapshot");
    }
    snap.inputsCurrent = false;
    await expect(run(client)).rejects.toMatchObject({ code: "STALE_RESULTS" });
    expect(client.completions).toEqual([]);
    expect(client.failures).toEqual(["WORKER_ERROR"]);
  });

  it("fails when the snapshot goes stale after the check and does not refresh the revision", async () => {
    const client = new MemoryClient(excavatorView());
    const snap = client.snaps[1];
    await expect(run(client, fixtureConfig, async () => {
      if (snap !== undefined) {
        snap.inputsCurrent = false;
      }
      return checkedRun(fixture("app-excavator-a") as AnalysisSnapshot);
    })).rejects.toMatchObject({ code: "STALE_RESULTS" });
    expect(client.completions).toEqual([]);
    expect(client.failures).toEqual(["WORKER_ERROR"]);
    expect(client.events).toEqual([]);
  });

  it("passes the configured model id for a live job and omits it for a fixture job", async () => {
    const live = new MemoryClient(excavatorView());
    const liveSnap = live.snaps[1];
    if (liveSnap === undefined) {
      throw new Error("missing snapshot");
    }
    liveSnap.executionMode = "live";
    const liveResult = await run(live, liveConfig, ({ snapshot }) => checkedRun(snapshot));
    expect(liveResult.modelId).toBe("nvidia/unit-model");
    expect(live.completions[0]?.modelId).toBe("nvidia/unit-model");
    expect(JSON.stringify(live.completions)).not.toContain("unit-test-key");

    const fixtureJob = new MemoryClient(excavatorView());
    const fixtureResult = await run(fixtureJob, liveConfig, ({ snapshot }) => checkedRun(snapshot));
    expect(fixtureResult.modelId).toBeUndefined();
    expect(fixtureJob.completions[0]?.modelId).toBeUndefined();
  });

  it("fails a live job when this worker is still in fixture mode", async () => {
    const client = new MemoryClient(excavatorView());
    const snap = client.snaps[1];
    if (snap === undefined) {
      throw new Error("missing snapshot");
    }
    snap.executionMode = "live";
    let called = false;
    await expect(run(client, fixtureConfig, async () => {
      called = true;
      return checkedRun(fixture("app-excavator-a") as AnalysisSnapshot);
    })).rejects.toMatchObject({ code: "CONFIG" });
    expect(called).toBe(false);
    expect(client.failures).toEqual(["MODEL_UNAVAILABLE"]);
    expect(client.completions).toEqual([]);
  });

  it("does not retry a claim, and retries one identical completion after a transient error", async () => {
    const claimed = new MemoryClient(excavatorView());
    claimed.claimError = new Error("503 unavailable");
    await expect(run(claimed)).rejects.toThrow(/503/);
    expect(claimed.claims).toBe(1);
    expect(claimed.completions).toEqual([]);

    const retried = new MemoryClient(excavatorView());
    retried.completeFailures = 1;
    await run(retried);
    expect(retried.completions).toHaveLength(2);
    expect(retried.completions[0]).toEqual(retried.completions[1]);
    expect(retried.failures).toEqual([]);
  });

  it("does not complete again after the server rejects the result as stale", async () => {
    const client = new MemoryClient(excavatorView());
    client.completeError = new Error("STALE_RESULTS");
    await expect(run(client)).rejects.toMatchObject({ code: "STALE_RESULTS" });
    expect(client.completions).toHaveLength(1);
    expect(client.failures).toEqual(["WORKER_ERROR"]);
  });

  it("rejects tool events outside the database limits before they are recorded", async () => {
    const event = {
      toolName: "run_collateral_check",
      status: "succeeded",
      inputSummary: "ok",
      outputSummary: "ok",
      durationMs: 1,
    };
    expect(toDatabaseToolEvent(2, event).sequence).toBe(2);
    expect(() => assertContiguousSequences([{ sequence: 1 }, { sequence: 3 }])).toThrow(/contiguous/);
    expect(() => toDatabaseToolEvent(1, { ...event, status: "running" })).toThrow(/status/);
    expect(() => toDatabaseToolEvent(1, { ...event, durationMs: 120_001 })).toThrow(/120000/);
    expect(safeToolSummary({ extractedValue: "demo_account_9", excerpt: "demo_account_9\nsecret" })).toBe('{"extractedValue":"[stored]"}');

    const client = new MemoryClient(excavatorView());
    await expect(run(client, fixtureConfig, async (investigation) => {
      const clean = await checkedRun(investigation.snapshot);
      return {
        ...clean,
        toolEvents: [{
          toolName: "run_collateral_check",
          status: "succeeded",
          inputSummary: "ok",
          outputSummary: "ok",
          modelContent: "ok",
          durationMs: 120_001,
        }],
      };
    })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(client.events).toEqual([]);
    expect(client.completions).toEqual([]);
    expect(client.failures).toEqual(["MODEL_TIMEOUT"]);
  });

  it("renews an expired lease before work and stops when the lease is lost", async () => {
    const expired = new MemoryClient(excavatorView());
    const snap = expired.snaps[1];
    if (snap === undefined) {
      throw new Error("missing snapshot");
    }
    snap.leaseExpiresAt = { toISOString: () => "2020-01-01T00:00:00.000Z" };
    await run(expired);
    expect(expired.order[1]).toBe("renew");
    expect(expired.order.lastIndexOf("renew")).toBeLessThan(expired.order.lastIndexOf("complete"));

    const lost = new MemoryClient(excavatorView());
    lost.renewError = new Error("LEASE_LOST");
    await expect(run(lost)).rejects.toMatchObject({ code: "LEASE_LOST" });
    expect(lost.completions).toEqual([]);
    expect(lost.failures).toEqual([]);
  });

  it("stops on cancellation and keeps a succeeded investigation when the draft write fails", async () => {
    const cancelled = new MemoryClient(excavatorView());
    await expect(run(cancelled, fixtureConfig, async () => {
      cancelled.outcomes.push({ id: "job-1", status: "cancelled", acceptedFindingIds: [], claimEpoch: 1 });
      return checkedRun(fixture("app-excavator-a") as AnalysisSnapshot);
    })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(cancelled.completions).toEqual([]);
    expect(cancelled.failures).toEqual([]);

    const drafted = new MemoryClient(excavatorView());
    drafted.draftError = new Error("draft reducer unavailable");
    const result = await run(drafted);
    expect(result.outcome).toBe("succeeded");
    expect(result.draftErrors).toHaveLength(result.findings.length);
    expect(drafted.failures).toEqual([]);
    expect(drafted.completions).toHaveLength(1);
  });

  it("refuses to store a finding the deterministic check did not produce", async () => {
    const client = new MemoryClient(excavatorView());
    await expect(run(client, fixtureConfig, async (investigation) => {
      const clean = await checkedRun(investigation.snapshot);
      const forged: DatabaseFindingInput = {
        ...(clean.findings[0] as DatabaseFindingInput),
        title: "Invented fraud match",
      };
      return { ...clean, findings: [forged] };
    })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(client.completions).toEqual([]);
    expect(client.failures).toEqual(["INVALID_MODEL_OUTPUT"]);
  });
});
