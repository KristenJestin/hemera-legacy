/** OS-backed Jev key handling. The renderer only receives a status (D59-06). */

import { safeStorage } from 'electron'
import { Effect } from 'effect'

import { encryptedWith, storageReady } from './classifier-storage.ts'
import type { EngineConversation } from './engine-conversation.ts'

export function protectedStorageReady(): boolean {
  return storageReady(safeStorage, process.platform)
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
