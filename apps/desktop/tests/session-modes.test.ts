/**
 * Every mode each agent reports, mapped to whether Hemera's own tools ask in it (issue #242).
 */

import { describe, expect, it } from 'vite-plus/test'

import { modeAsks } from '#engine/agents/modes.ts'

describe('Every mode each agent reports asks or does not', () => {
  it.each([
    ['claude', 'default', true],
    ['claude', 'acceptEdits', true],
    ['claude', 'plan', true],
    ['claude', 'dontAsk', true],
    ['claude', 'auto', false],
    ['claude', 'bypassPermissions', false],
    ['codex', 'read-only', true],
    ['codex', 'agent', false],
    ['codex', 'agent-full-access', false],
    ['opencode', 'build', true],
    ['opencode', 'plan', true],
    ['opencode', 'hemera', true],
  ])('%s in %s asks: %s', (agent, mode, asks) => {
    expect(modeAsks({ agent, mode, name: mode })).toBe(asks)
  })
})

describe('An unknown mode asks', () => {
  it('asks for a mode the table does not know, an agent it does not know, and no mode', () => {
    expect(modeAsks({ agent: 'claude', mode: 'something-new', name: 'New' })).toBe(true)
    expect(modeAsks({ agent: 'someone-else', mode: 'auto', name: 'Auto' })).toBe(true)
    expect(modeAsks({ agent: 'codex', mode: 'auto', name: 'Auto' })).toBe(true)
    expect(modeAsks(null)).toBe(true)
  })
})
