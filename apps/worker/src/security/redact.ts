const BEARER = /Bearer\s+\S+/gi;

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text.replace(BEARER, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}
