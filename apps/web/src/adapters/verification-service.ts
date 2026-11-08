import { z } from 'zod';

const resultSchema = z.object({
  source: z.enum(['uploaded-contract', 'server-demo']),
  executionMode: z.enum(['live', 'fixture']),
  model: z.string().min(1),
  assistantSummary: z.string().nullable(),
  explanationError: z.string().optional(),
  extracted: z.object({
    businessName: z.string().nullable(),
    amountCents: z.number().int().nonnegative().nullable(),
    currency: z.string().nullable(),
    identifier: z.string().nullable(),
    exclusiveOwnershipClaim: z.boolean(),
  }).optional(),
  comparedWith: z.array(z.object({ id: z.string(), businessName: z.string() })).optional(),
  tools: z.array(z.object({ name: z.string(), status: z.string() })),
  findings: z.array(z.object({
    title: z.string(),
    relatedApplicationIds: z.array(z.string()),
    relatedBusinessNames: z.array(z.string()),
  })),
});

export type VerificationResult = z.infer<typeof resultSchema>;
export function hasLiveExplanation(result: VerificationResult): boolean {
  return result.executionMode === 'live' && !result.explanationError && Boolean(result.assistantSummary?.trim());
}

// The API key remains on the server. The request sends the selected PDF itself,
// never the local fixture snapshot or an officer's database session token.
export async function requestVerification(file?: File, signal?: AbortSignal): Promise<VerificationResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 150_000);
  try {
    const response = await fetch('/api/investigate', {
      method: 'POST',
      ...(file ? { body: file, headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(file.name) } } : {}),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error('The verification service returned an invalid response. No AI result was confirmed.'); }
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message.slice(0, 500) : `The verification service did not finish (HTTP ${response.status}).`;
      throw new Error(message);
    }
    const parsed = resultSchema.safeParse(body);
    if (!parsed.success) throw new Error('The verification service returned incomplete results. No AI result was confirmed.');
    const result = parsed.data;
    if (result.source !== (file ? 'uploaded-contract' : 'server-demo') || (file && (!result.extracted || !result.comparedWith))) {
      throw new Error('The service did not confirm analysis of your selected document. No sample result was substituted.');
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Verification cancelled.' : 'The verification service timed out. No AI result was confirmed.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
