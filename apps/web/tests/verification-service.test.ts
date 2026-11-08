import { afterEach, expect, test, vi } from 'vitest';
import { hasLiveExplanation, requestVerification } from '../src/adapters/verification-service';

const result = () => ({
  source: 'uploaded-contract' as const, executionMode: 'live' as const, model: 'test-live-model',
  assistantSummary: 'Review the duplicate equipment claim.',
  extracted: { businessName: 'Redwood', amountCents: 18000000, currency: 'USD', identifier: 'FL-004821', exclusiveOwnershipClaim: true },
  comparedWith: [{ id: 'demo-case-1', businessName: 'Northline Foods' }],
  tools: [{ name: 'run_collateral_check', status: 'succeeded' }],
  findings: [{ title: 'Potential duplicate', relatedApplicationIds: ['demo-case-1'], relatedBusinessNames: ['Northline Foods'] }],
});
afterEach(() => vi.unstubAllGlobals());

test('sends the selected PDF bytes to the server without database credentials', async () => {
  const file = new File(['%PDF-1.4 actual uploaded bytes'], 'loan #1.pdf');
  const fetcher = vi.fn().mockResolvedValue(Response.json(result())); vi.stubGlobal('fetch', fetcher);
  const response = await requestVerification(file);
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url).toBe('/api/investigate'); expect(options.method).toBe('POST'); expect(options.body).toBe(file);
  expect(options.headers).toEqual({ 'content-type': 'application/pdf', 'x-filename': 'loan%20%231.pdf' });
  expect(options.credentials).toBe('omit'); expect(options.redirect).toBe('error');
  expect(hasLiveExplanation(response)).toBe(true);
});

test('rejects a sample result substituted for an uploaded file', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result(), source: 'server-demo' })));
  await expect(requestVerification(new File(['%PDF'], 'contract.pdf'))).rejects.toThrow('No sample result was substituted');
});

test('does not claim AI success when the server returns deterministic checks after an AI failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result(), assistantSummary: null, explanationError: 'TIMEOUT' })));
  const response = await requestVerification(new File(['%PDF'], 'contract.pdf'));
  expect(hasLiveExplanation(response)).toBe(false); expect(response.findings).toHaveLength(1);
  expect(hasLiveExplanation({ ...result(), executionMode: 'fixture' })).toBe(false);
});

test('preserves missing identifiers and empty findings instead of inventing a clean result', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result(), extracted: { ...result().extracted, identifier: null }, findings: [] })));
  const response = await requestVerification(new File(['%PDF'], 'contract.pdf'));
  expect(response.extracted?.identifier).toBeNull(); expect(response.findings).toEqual([]);
});

test('reports server failure and invalid responses rather than returning a sample', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Worker unavailable' }, { status: 503 }))
    .mockResolvedValueOnce(new Response('<html>Proxy failure</html>', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ executionMode: 'live' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(requestVerification()).rejects.toThrow('Worker unavailable');
  await expect(requestVerification()).rejects.toThrow('invalid response');
  await expect(requestVerification()).rejects.toThrow('incomplete results');
});

test('cancels an obsolete request', async () => {
  vi.stubGlobal('fetch', (_: unknown, options: RequestInit) => new Promise((_, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const controller = new AbortController(); const pending = requestVerification(undefined, controller.signal); controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
});
