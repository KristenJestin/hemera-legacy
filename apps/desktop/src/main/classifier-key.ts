/** OS-backed Jev key handling. The renderer only receives a status (D59-06). */

import { safeStorage } from 'electron'
import { Effect } from 'effect'

import { encryptedWith, storageReady } from './classifier-storage.ts'
import type { EngineConversation } from './engine-conversation.ts'
import { missingSecretService } from './secret-service.ts'

/** The session bus as it was at start, on Linux only; null when it could not be asked. */
let busNames: readonly string[] | null = null

export function rememberBusNames(names: readonly string[] | null): void {
  busNames = names
}

export function protectedStorageReady(): boolean {
  return storageReady(safeStorage, process.platform)
}

/** The backend `safeStorage` chose; only Linux names one. */
export function protectedStorageBackend(): string {
  return process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'system'
}

/** What is missing for protected storage, said once in Settings, or null. */
export function protectedStorageMissing(): string | null {
  return missingSecretService({
    platform: process.platform,
    ready: protectedStorageReady(),
    busNames,
  })
}

/** Called before the window is loaded, so an existing key can serve the first call. */
export async function restoreClassifierKey(engine: EngineConversation): Promise<void> {
  if (!protectedStorageReady()) return
  try {
    const ciphertext = await Effect.runPromise(engine.ask('classifier.ciphertext.read', {}))
    if (ciphertext === null) return
    const plaintext = safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    await Effect.runPromise(engine.ask('classifier.key.restore', { plaintext }))
  } catch {
    // A key this OS cannot decrypt stays unusable; no plaintext or provider error is logged.
  }
}

export function encryptClassifierKey(key: string): string | null {
  return encryptedWith(safeStorage, process.platform, key)
}
