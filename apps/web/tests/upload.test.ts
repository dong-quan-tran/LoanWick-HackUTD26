import { describe, expect, test, vi } from 'vitest';
import { createUploadCapability, UnconfirmedUploadError, uploadWithCapability } from '../src/adapters/upload';
import { LiveAdapter, publicId } from '../src/adapters/live';
import type { UploadGrant, UploadPort } from '../src/adapters/upload';
const scope = { origin: 'https://documents.example.test', applicationId: 'demo-case-1', requestId: 'request-1', documentType: 'collateral_schedule', workerUserId: 'worker-1' };
const file = () => new File(['{"label":"SYNTHETIC DEMO DOCUMENT"}'], 'schedule.json', { type: 'application/json' });
function port() {
  let grant: UploadGrant = { id: 'grant-1', secretHash: '', status: 'ready' };
  const create = vi.fn(async (input: Parameters<UploadPort['create']>[0]) => { grant = { ...grant, secretHash: input.secretHash }; return grant; });
  return {
    create,
    observe: vi.fn(async (_hash: string, predicate: (grant: UploadGrant) => boolean) => { if (!predicate(grant)) throw new Error('Unconfirmed grant state'); return grant; }),
    revoke: vi.fn(async () => { if (grant.status === 'attached') throw new Error('Already attached'); grant = { ...grant, status: 'revoked' }; }),
    attach: (documentId = 'document-1') => { grant = { ...grant, status: 'attached', attachedDocumentId: documentId }; },
  };
}
describe('Person 2 HTTPS capability contract', () => {
  test('hashes 32 random bytes and does not reuse capabilities', async () => {
    const a = await createUploadCapability(); const b = await createUploadCapability();
    expect(a.secret).toMatch(/^[0-9a-f]{64}$/); expect(a.secretHash).toMatch(/^[0-9a-f]{64}$/); expect(a.secret).not.toBe(b.secret);
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(a.secret.match(/../g)!, byte => parseInt(byte, 16)));
    expect(Buffer.from(digest).toString('hex')).toBe(a.secretHash);
  });
  test('sends only digest to DB and scoped secret headers to HTTPS, without DB token or cookies', async () => {
    const db = port(); let requestSecret = '';
    const fetcher: typeof fetch = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://documents.example.test/documents/upload');
      const headers = new Headers(init?.headers); requestSecret = headers.get('X-Upload-Secret')!;
      expect(headers.get('X-Upload-Grant')).toBe('grant-1'); expect(headers.get('X-Application-Id')).toBe(scope.applicationId);
      expect(headers.has('Authorization')).toBe(false); expect(headers.has('Content-Length')).toBe(false);
      expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error'); expect(init?.body).toBeInstanceOf(File);
      db.attach(); return new Response(JSON.stringify({ documentId: 'document-1' }), { status: 201 });
    });
    expect(await uploadWithCapability({ ...scope, file: file(), port: db, fetcher })).toBe('document-1');
    expect(JSON.stringify(db.create.mock.calls)).not.toContain(requestSecret);
    expect(db.observe).toHaveBeenCalled(); expect(db.revoke).not.toHaveBeenCalled();
  });
  test('reconciles an attached document after losing the HTTPS response without replay', async () => {
    const db = port(); const fetcher = vi.fn(async () => { db.attach(); throw new Error('Connection lost'); });
    expect(await uploadWithCapability({ ...scope, file: file(), port: db, fetcher })).toBe('document-1');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(db.revoke).toHaveBeenCalledTimes(1);
  });
  test('revokes a failed uncommitted attempt rather than inventing a received document', async () => {
    const db = port(); const fetcher = vi.fn(async () => new Response('{"error":"UPLOAD_DENIED"}', { status: 403 }));
    await expect(uploadWithCapability({ ...scope, file: file(), port: db, fetcher })).rejects.toThrow('capability was revoked');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(db.revoke).toHaveBeenCalledTimes(1);
  });
  test('rejects insecure endpoints and unsupported/empty files before authorizing', async () => {
    const db = port(); const fetcher = vi.fn();
    await expect(uploadWithCapability({ ...scope, origin: 'http://documents.example.test', file: file(), port: db, fetcher })).rejects.toThrow('HTTPS');
    await expect(uploadWithCapability({ ...scope, file: new File(['binary'], 'scan.pdf'), port: db, fetcher })).rejects.toThrow('JSON or CSV');
    await expect(uploadWithCapability({ ...scope, file: new File([], 'empty.json'), port: db, fetcher })).rejects.toThrow('nonempty');
    expect(db.create).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  test('retains non-secret pending metadata when revoke and observation are unavailable', async () => {
    const db = port(); db.revoke.mockImplementation(async () => { throw new Error('Disconnected'); }); db.observe.mockImplementation(async () => { throw new Error('Disconnected'); });
    const fetcher = vi.fn(async () => { throw new Error('Lost response'); });
    try { await uploadWithCapability({ ...scope, file: file(), port: db, fetcher }); throw new Error('Should not confirm'); }
    catch (error) {
      expect(error).toBeInstanceOf(UnconfirmedUploadError);
      expect((error as UnconfirmedUploadError).attempt.id).toBe('grant-1');
      expect((error as UnconfirmedUploadError).attempt.secretHash).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys((error as UnconfirmedUploadError).attempt)).toEqual(['id', 'secretHash']);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('live upload lifetime', () => {
  // Unit-level session events only: no fake claim of real database authorization.
  type Internals = {
    uploads: Set<AbortController>; pendingUploads: Map<string, { id: string; secretHash: string }>;
    generation: number; ready: boolean; state: { status: string; user: unknown; message: string | null };
    connection: unknown;
    connectionError(generation: number, message: string): void;
    invalidate(status: 'forbidden' | 'disconnected', message: string, clearUser?: boolean): void;
  };
  test('connection loss aborts active HTTPS controllers and preserves uncertain attempts', () => {
    const adapter = new LiveAdapter(); const internal = adapter as unknown as Internals; const controller = new AbortController();
    internal.uploads.add(controller); internal.pendingUploads.set('borrower|request', { id: 'grant', secretHash: 'a'.repeat(64) });
    internal.connectionError(internal.generation, 'Connection lost');
    expect(controller.signal.aborted).toBe(true); expect(internal.uploads.size).toBe(0); expect(internal.pendingUploads.size).toBe(1);
  });
  test('the authorization-revocation path aborts active HTTPS controllers and clears the role', () => {
    const adapter = new LiveAdapter(); const internal = adapter as unknown as Internals; const controller = new AbortController();
    internal.uploads.add(controller); internal.invalidate('forbidden', 'Identity revoked', true);
    expect(controller.signal.aborted).toBe(true); expect(internal.state.user).toBeNull(); expect(internal.state.status).toBe('forbidden');
  });
  test('restored server grants require reconciliation even without an in-memory attempt', () => {
    const adapter = new LiveAdapter(); const internal = adapter as unknown as Internals;
    internal.ready = true; internal.state = { status: 'connected', message: null, user: { id: publicId('borrower-1'), role: 'borrower' } };
    internal.connection = { db: { myUploadGrants: { iter: () => [{ requestId: 'request-1', status: 'claimed' }] }, borrowerDocuments: { iter: () => [] } } };
    expect(adapter.uploadNeedsReconciliation(publicId('request-1'))).toBe(true);
  });
});
