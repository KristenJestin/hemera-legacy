/** Redaction before any action or human context leaves the machine (D59-06). */

import { z } from 'zod'

const credentialField = /(?:api[_-]?key|password|passwd|secret|token|credential|authorization)/i
const destinationField = /^(?:path|target|resolvedTarget|cwd|command|program|line|url|host)$/i
/** A header whose whole value is a credential: its scheme goes with its token. */
const credentialHeader =
  /\b(authorization|proxy-authorization|cookie|set-cookie)(\s*[:=]\s*)[^"'\r\n]+/gi
const bearer = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi
/** Tokens recognisable by their prefix alone, wherever they appear. */
const prefixedToken =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[abprs]-[A-Za-z0-9-]{8,}|glpat-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g
/** The password in a URL's user information; the host stays readable. */
const urlPassword = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi
const credentialInText =
  /\b(api[_ -]?key|password|passwd|secret|token|credential)\s*[:=]\s*([^\s,;]+)/gi
const MASK = '[REDACTED]'

/** Credentials recognised by their shape, masked without knowing their value. */
function maskShapes(text: string): string {
  return text
    .replace(credentialHeader, (_, name: string, separator: string) => `${name}${separator}${MASK}`)
    .replace(bearer, (_, scheme: string) => `${scheme} ${MASK}`)
    .replace(prefixedToken, MASK)
    .replace(urlPassword, (_, user: string) => `${user}${MASK}@`)
    .replace(credentialInText, (_, label: string) => `${label}=${MASK}`)
}

function maskKnown(text: string, secrets: readonly string[]): string {
  let redacted = text
  for (const secret of secrets) {
    if (secret !== '') redacted = redacted.replaceAll(secret, MASK)
  }
  return redacted
}

export function redactText(text: string, secrets: readonly string[]): string {
  return maskShapes(maskKnown(text, secrets))
}

/**
 * The values among a Workspace's variables that are masked as known secrets: those whose name
 * says they are a credential. A port or a filter name is not one, and masking it wherever it
 * appears would void every action that happens to contain it.
 */
export function knownSecretValues(environment: Readonly<Record<string, string>>): string[] {
  return Object.entries(environment)
    .filter(([name, value]) => value !== '' && credentialField.test(name))
    .map(([, value]) => value)
}

/**
 * Never send a partial action: its structure and destination must survive masking. A credential
 * recognised by its shape leaves a destination readable (the URL of a `curl` stays); a known
 * secret value inside a destination may be the destination itself, and then nothing is sent.
 */
export function redactAction(action: string, secrets: readonly string[]): string | null {
  try {
    // SAFETY: JSON.parse is validated by z.json before the tree is traversed.
    const read = z.json().safeParse(JSON.parse(action))
    if (!read.success || read.data === null || Array.isArray(read.data)) return null
    let lostDestination = false
    const visit = (
      value: z.infer<ReturnType<typeof z.json>>,
      key = '',
    ): z.infer<ReturnType<typeof z.json>> => {
      if (credentialField.test(key)) return MASK
      const string = z.string().safeParse(value)
      if (string.success) {
        const clean = redactText(string.data, secrets)
        if (destinationField.test(key) && clean !== maskShapes(string.data)) {
          lostDestination = true
        }
        return clean
      }
      if (Array.isArray(value)) return value.map((item) => visit(item))
      const record = z.record(z.string(), z.json()).safeParse(value)
      if (record.success) {
        return Object.fromEntries(
          Object.entries(record.data).map(([name, item]) => [name, visit(item, name)]),
        )
      }
      return value
    }
    const clean = visit(read.data)
    return lostDestination ? null : JSON.stringify(clean)
  } catch {
    return null
  }
}

/**
 * A stored record shown again (#294): every string in it masked by its shape, and a credential
 * field masked whole. Unlike an action, nothing is refused: a destination masked is still shown.
 * What does not read as JSON is masked as text.
 */
export function redactRecord(record: string): string {
  const visit = (
    value: z.infer<ReturnType<typeof z.json>>,
    key = '',
  ): z.infer<ReturnType<typeof z.json>> => {
    if (credentialField.test(key)) return MASK
    const string = z.string().safeParse(value)
    if (string.success) return maskShapes(string.data)
    if (Array.isArray(value)) return value.map((item) => visit(item))
    const fields = z.record(z.string(), z.json()).safeParse(value)
    if (fields.success) {
      return Object.fromEntries(
        Object.entries(fields.data).map(([name, item]) => [name, visit(item, name)]),
      )
    }
    return value
  }
  try {
    // SAFETY: JSON.parse is validated by z.json before the tree is traversed.
    const read = z.json().safeParse(JSON.parse(record))
    return read.success ? JSON.stringify(visit(read.data)) : maskShapes(record)
  } catch {
    return maskShapes(record)
  }
}
