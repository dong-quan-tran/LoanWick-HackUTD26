export interface UploadGrant {
  id: string; secretHash: string; status: string; attachedDocumentId?: string | undefined;
}
export interface UploadPort {
  create(input: { secretHash: string; applicationId: string; requestId?: string | undefined; workerUserId: string; documentType: string; maxBytes: number; ttlSeconds: number }): Promise<UploadGrant>;
  observe(secretHash: string, predicate: (grant: UploadGrant) => boolean): Promise<UploadGrant>;
  revoke(grantId: string): Promise<void>;
}
export class UnconfirmedUploadError extends Error {
  constructor(public readonly attempt: Pick<UploadGrant, 'id' | 'secretHash'>) {
    super('The upload outcome is unconfirmed. Reconnect and reconcile the previous attempt before selecting another document.');
  }
}
export async function reconcileUploadGrant(port: UploadPort, grant: Pick<UploadGrant, 'id' | 'secretHash'>): Promise<string | null> {
  try { await port.revoke(grant.id); } catch { /* Attachment may have committed first. */ }
  try {
    const terminal = await port.observe(grant.secretHash, current => current.status === 'attached' || current.status === 'revoked');
    if (terminal.status === 'attached' && terminal.attachedDocumentId) return terminal.attachedDocumentId;
    if (terminal.status === 'revoked') return null;
  } catch { /* Never collapse an unknown outcome into a safe-to-retry failure. */ }
  throw new UnconfirmedUploadError({ id: grant.id, secretHash: grant.secretHash });
}
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
export async function createUploadCapability() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { secret: hex(bytes), secretHash: hex(new Uint8Array(digest)) };
}
export async function uploadWithCapability(input: {
  file: File; origin: string; applicationId: string; requestId?: string | undefined; documentType: string;
  format?: 'structured' | 'contract';
  workerUserId: string; port: UploadPort; signal?: AbortSignal | undefined; fetcher?: typeof fetch;
}): Promise<string> {
  const { file, port } = input;
  const origin = new URL(input.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Document intake requires an HTTPS service without credentials in its URL.');
  if (input.format === 'contract' ? !/\.(pdf|docx)$/i.test(file.name) : !/\.(json|csv)$/i.test(file.name)) throw new Error(input.format === 'contract' ? 'Choose a PDF or DOCX contract.' : 'Choose a JSON or CSV document. This intake does not support other formats.');
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a nonempty document no larger than 10 MiB.');
  const capability = await createUploadCapability();
  // Only the digest goes to SpacetimeDB. The raw secret stays in this call's memory.
  const grant = await port.create({ secretHash: capability.secretHash, applicationId: input.applicationId, requestId: input.requestId, workerUserId: input.workerUserId, documentType: input.documentType, maxBytes: file.size, ttlSeconds: 300 });
  const headers = new Headers({
    'Content-Type': /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.csv$/i.test(file.name) ? 'text/csv' : 'application/json',
    'X-Upload-Grant': grant.id, 'X-Upload-Secret': capability.secret,
    'X-Application-Id': input.applicationId, 'X-Document-Type': input.documentType,
  });
  if (input.requestId) headers.set('X-Request-Id', input.requestId);
  try {
    const signals = [AbortSignal.timeout(30_000), ...(input.signal ? [input.signal] : [])];
    const response = await (input.fetcher ?? fetch)(new URL('/documents/upload', origin), {
      method: 'POST', credentials: 'omit', redirect: 'error', headers, body: file, signal: AbortSignal.any(signals),
    });
    if (!response.ok) throw new Error('The document service did not accept this upload.');
    const receipt: unknown = await response.json();
    const documentId = receipt && typeof receipt === 'object' && 'documentId' in receipt ? receipt.documentId : null;
    if (typeof documentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(documentId)) throw new Error('The document service returned an invalid receipt.');
    const attached = await port.observe(capability.secretHash, current => current.status === 'attached' && current.attachedDocumentId === documentId);
    return attached.attachedDocumentId!;
  } catch {
    // A lost HTTPS response may still have committed. Revoke or reconcile; never replay bytes blindly.
    const attached = await reconcileUploadGrant(port, grant);
    if (attached) return attached;
    throw new Error('The upload was not attached and its capability was revoked. Check the connection, then select the document again.');
  }
}
