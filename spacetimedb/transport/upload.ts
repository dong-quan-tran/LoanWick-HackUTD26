import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, type ServerOptions } from 'node:https'
import { TLSSocket } from 'node:tls'
import type { DbConnection } from '../bindings'

type AttachArgs = Parameters<DbConnection['reducers']['attachDocument']>[0]
type StoredDocument = Omit<AttachArgs, 'grantId' | 'claimId' | 'byteLength' | 'documentId' | 'sha256'>
type StoreDocument = (input: {
  documentId: string
  applicationId: string
  requestId?: string
  documentType: string
  uploaderId: string
  bytes: Buffer
  sha256: string
}) => Promise<StoredDocument>

function header(request: IncomingMessage, name: string) {
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' })
  response.end(JSON.stringify(body))
}

function denies(response: ServerResponse) {
  reply(response, 403, { error: 'UPLOAD_DENIED' })
}

async function readBytes(request: IncomingMessage, byteLength: number) {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.length
    if (total > byteLength) return undefined
    chunks.push(bytes)
  }
  return total === byteLength ? Buffer.concat(chunks, total) : undefined
}

// Connect with the service's worker identity and subscribe to worker_upload_grants before serving requests.
export function createUploadServer(
  { allowedOrigin, ...options }: ServerOptions & { allowedOrigin?: string }, worker: DbConnection, storeDocument: StoreDocument,
) {
  async function upload(request: IncomingMessage, response: ServerResponse) {
    if (request.url !== '/documents/upload') {
      reply(response, 404, { error: 'NOT_FOUND' })
      return
    }
    if (!(request.socket instanceof TLSSocket) || !request.socket.encrypted || request.headers.authorization !== undefined) {
      denies(response)
      return
    }
    const origin = header(request, 'origin')
    if (origin && allowedOrigin && origin !== allowedOrigin) {
      denies(response)
      return
    }
    if (origin && origin === allowedOrigin) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'content-type, x-upload-grant, x-upload-secret, x-application-id, x-request-id, x-document-type',
        })
        response.end()
        return
      }
    }
    if (request.method !== 'POST') {
      reply(response, 405, { error: 'METHOD_NOT_ALLOWED' })
      return
    }
    const grantId = header(request, 'x-upload-grant')
    const secret = header(request, 'x-upload-secret')
    const applicationId = header(request, 'x-application-id')
    const requestId = header(request, 'x-request-id')
    const documentType = header(request, 'x-document-type')
    const length = header(request, 'content-length')
    if (!grantId || !secret || !/^[0-9a-f]{64}$/.test(secret) || !applicationId || !documentType) {
      denies(response)
      return
    }
    const grant = [...worker.db.workerUploadGrants.iter()].find(row => row.id === grantId)
    if (!grant || grant.status !== 'ready' || grant.applicationId !== applicationId ||
      grant.requestId !== requestId || grant.documentType !== documentType || grant.expiresAt.toMillis() <= BigInt(Date.now())) {
      denies(response)
      return
    }
    const digest = createHash('sha256').update(Buffer.from(secret, 'hex')).digest()
    const expected = Buffer.from(grant.secretHash, 'hex')
    if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) {
      denies(response)
      return
    }
    const byteLength = Number(length)
    if (!length || request.headers['transfer-encoding'] !== undefined) {
      reply(response, 411, { error: 'CONTENT_LENGTH_REQUIRED' })
      return
    }
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > grant.maxBytes) {
      reply(response, 413, { error: 'INVALID_UPLOAD_SIZE' })
      return
    }
    const claimId = randomUUID()
    try {
      await worker.reducers.claimUpload({ grantId, claimId, applicationId, requestId, documentType, byteLength })
    } catch {
      denies(response)
      return
    }
    if (request.destroyed || response.destroyed) return
    if (request.headers.expect?.toLowerCase() === '100-continue') response.writeContinue()
    const bytes = await readBytes(request, byteLength)
    if (!bytes) {
      reply(response, 400, { error: 'INVALID_UPLOAD_BODY' })
      return
    }
    if (grant.expiresAt.toMillis() <= BigInt(Date.now())) {
      denies(response)
      return
    }
    const documentId = randomUUID()
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const stored = await storeDocument({ documentId, applicationId, requestId, documentType, uploaderId: grant.uploaderId, bytes, sha256 })
    await worker.reducers.attachDocument({ ...stored, grantId, claimId, byteLength, documentId, sha256 })
    reply(response, 201, { documentId })
  }

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    void upload(request, response).catch(() => {
      if (!response.headersSent && !response.destroyed) reply(response, 500, { error: 'UPLOAD_FAILED' })
    })
  }
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, ...options }, handle)
  server.on('checkContinue', handle)
  return server
}
