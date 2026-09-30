/**
 * Whether the OS can protect the Jev key, and what App Settings is told of it (D59-06). No
 * Electron here: the main process hands `safeStorage` over, so the rule is testable on its own.
 */

/** Where the key stands, as `classifier.read` answers it. */
export type CredentialStatus = 'missing' | 'saved' | 'invalid' | 'storage-unavailable'

/** The part of Electron's `safeStorage` this rule reads. */
export interface ProtectedStorage {
  readonly isEncryptionAvailable: () => boolean
  readonly getSelectedStorageBackend: () => string
  readonly encryptString: (text: string) => Buffer
}

/** Linux's `basic_text` backend is a plain-text fallback: it protects nothing, so it is refused. */
export function storageReady(storage: ProtectedStorage, platform: string): boolean {
  return (
    storage.isEncryptionAvailable() &&
    (platform !== 'linux' || storage.getSelectedStorageBackend() !== 'basic_text')
  )
}

/** The sealed key to store, or null: without protected storage nothing is stored at all. */
export function encryptedWith(
  storage: ProtectedStorage,
  platform: string,
  key: string,
): string | null {
  if (!storageReady(storage, platform)) return null
  try {
    return storage.encryptString(key).toString('base64')
  } catch {
    return null
  }
}

/** What App Settings shows of the key: never the key, only where it stands. */
export function credentialStatus(read: {
  readonly ready: boolean
  readonly hasKey: boolean
  readonly ciphertext: string | null
}): CredentialStatus {
  if (!read.ready) return 'storage-unavailable'
  if (read.hasKey) return 'saved'
  return read.ciphertext === null ? 'missing' : 'invalid'
}
