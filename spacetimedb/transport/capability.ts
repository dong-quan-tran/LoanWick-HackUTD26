const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export async function createUploadCapability() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return { secret: hex(bytes), secretHash: hex(new Uint8Array(digest)) }
}
