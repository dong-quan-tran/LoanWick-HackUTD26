import { describe, expect, it } from "vitest";
import type { AnalysisSnapshot } from "@loanwick/contracts";

import { WorkerRunError } from "../src/errors.js";
import { runCaseInvestigation } from "../src/investigation/run-case.js";
import type { ModelProvider, ProviderTurn } from "../src/provider/types.js";
import { fixture } from "../../../tests/helpers.js";

const snapshot = fixture("app-excavator-a") as AnalysisSnapshot;

describe("case investigation", () => {
  it("reports the shared equipment claim from the demo snapshot", async () => {
    const result = await runCaseInvestigation({
      provider: { executionMode: "fixture", model: "fixture", complete: unusedComplete },
      snapshot,
      maxSteps: 8,
      signal: new AbortController().signal,
    });
    expect(result.executionMode).toBe("fixture");
    expect(result.findings.map((finding) => finding.type)).toContain("collateral_conflict");
    expect(result.findings.some((finding) => finding.relatedApplicationIds.includes("app-excavator-b"))).toBe(true);
    expect(result.toolEvents.map((event) => event.toolName)).toEqual([
      "get_application_summary",
      "run_collateral_check",
      "run_group_threshold_check",
      "get_payment_verification_state",
    ]);
    for (const event of result.toolEvents) {
      expect(event.outputSummary.includes("\n")).toBe(false);
      expect(event.outputSummary.length).toBeLessThanOrEqual(280);
    }
  });

  it("rejects a live answer that skips the collateral check", async () => {
    const provider: ModelProvider = {
      executionMode: "live",
      model: "scripted",
      async complete(): Promise<ProviderTurn> {
        return { model: "scripted", message: { content: "No concern.", toolCalls: [] } };
      },
    };
    await expect(runCaseInvestigation({
      provider,
      snapshot,
      maxSteps: 4,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "TOOL_REQUIRED" });
  });

  it("keeps the stored finding on the deterministic check when the model explains it", async () => {
    let step = 0;
    const provider: ModelProvider = {
      executionMode: "live",
      model: "scripted",
      async complete(_messages, _tools): Promise<ProviderTurn> {
        step += 1;
        if (step === 1) {
          return { model: "scripted", message: { content: null, toolCalls: [{ id: "c", name: "run_collateral_check", arguments: { applicationId: snapshot.applicationId } }] } };
        }
        if (step === 2) {
          return { model: "scripted", message: { content: null, toolCalls: [{ id: "g", name: "run_group_threshold_check", arguments: { applicationId: snapshot.applicationId } }] } };
        }
        return { model: "scripted", message: { content: "Equipment EX-0042 is listed on two applications. A typo could explain it.", toolCalls: [] } };
      },
    };
    const result = await runCaseInvestigation({
      provider,
      snapshot,
      maxSteps: 8,
      signal: new AbortController().signal,
    });
    expect(result.model).toBe("scripted");
    expect(result.findings.some((finding) => finding.type === "collateral_conflict")).toBe(true);
    expect(result.assistantSummary).toContain("EX-0042");
    expect(result.toolEvents.every((event) => event.status === "succeeded")).toBe(true);
  });

  it("rejects a tool aimed at a different application", async () => {
    const provider: ModelProvider = {
      executionMode: "live",
      model: "scripted",
      async complete(): Promise<ProviderTurn> {
        return { model: "scripted", message: { content: null, toolCalls: [{ id: "x", name: "run_collateral_check", arguments: { applicationId: "app-other" } }] } };
      },
    };
    await expect(runCaseInvestigation({
      provider,
      snapshot,
      maxSteps: 4,
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(WorkerRunError);
  });
});

function unusedComplete(): Promise<ProviderTurn> {
  return Promise.reject(new Error("fixture mode does not call the model"));
}
