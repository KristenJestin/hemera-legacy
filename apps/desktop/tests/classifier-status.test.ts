import { describe, expect, it } from 'vite-plus/test'

import { menuStatus, settingsEvaluator } from '#renderer/classifier-status.ts'

describe('An unavailable evaluator is visible in App Settings and the model menu', () => {
  it('shows in App Settings when the settings do not read, and a change before anything else', () => {
    expect(settingsEvaluator({ busy: false, failed: false })).toBe('ready')
    expect(settingsEvaluator({ busy: false, failed: true })).toBe('unavailable')
    expect(settingsEvaluator({ busy: true, failed: true })).toBe('transitioning')
  })

  it('is ready in the model menu only with a saved key, consent, and settings that read', () => {
    const ready = { busy: false, failed: false, credential: 'saved', consent: true } as const
    expect(menuStatus(ready)).toBe('ready')
    expect(menuStatus({ ...ready, credential: 'missing' })).toBe('unavailable')
    expect(menuStatus({ ...ready, credential: 'invalid' })).toBe('unavailable')
    expect(menuStatus({ ...ready, credential: 'storage-unavailable' })).toBe('unavailable')
    expect(menuStatus({ ...ready, consent: false })).toBe('unavailable')
    expect(menuStatus({ ...ready, failed: true })).toBe('unavailable')
    expect(menuStatus({ ...ready, busy: true, failed: true })).toBe('transitioning')
  })
})
