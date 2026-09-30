import { describe, expect, test } from 'vite-plus/test'

import {
  type ProtectedStorage,
  credentialStatus,
  encryptedWith,
  storageReady,
} from '#main/classifier-storage.ts'

const storage = (available: boolean, backend = 'gnome_libsecret'): ProtectedStorage => ({
  isEncryptionAvailable: () => available,
  getSelectedStorageBackend: () => backend,
  encryptString: (text) => Buffer.from(`sealed:${text}`),
})

describe('Unavailable protected storage has no plaintext fallback', () => {
  test('no encryption, or Linux plain-text storage, is unavailable and stores nothing', () => {
    expect(storageReady(storage(false), 'win32')).toBe(false)
    expect(storageReady(storage(true, 'basic_text'), 'linux')).toBe(false)
    expect(encryptedWith(storage(false), 'win32', 'jev-key')).toBeNull()
    expect(encryptedWith(storage(true, 'basic_text'), 'linux', 'jev-key')).toBeNull()
  })

  test('protected storage keeps only the sealed key', () => {
    expect(storageReady(storage(true), 'linux')).toBe(true)
    const sealed = encryptedWith(storage(true), 'linux', 'jev-key')
    expect(sealed).toBe(Buffer.from('sealed:jev-key').toString('base64'))
  })

  test('settings read storage unavailable before anything about the key', () => {
    expect(credentialStatus({ ready: false, hasKey: true, ciphertext: 'x' })).toBe(
      'storage-unavailable',
    )
    expect(credentialStatus({ ready: true, hasKey: true, ciphertext: 'x' })).toBe('saved')
    expect(credentialStatus({ ready: true, hasKey: false, ciphertext: null })).toBe('missing')
    // Stored, but this OS could not open it: the key is there and unusable.
    expect(credentialStatus({ ready: true, hasKey: false, ciphertext: 'x' })).toBe('invalid')
  })
})
