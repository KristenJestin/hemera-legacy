import { describe, expect, test } from 'vite-plus/test'

import {
  HEMERA_AUTO_MODE,
  autoGoverns,
  autoResets,
  modeBehaviour,
  neutralMode,
  permissionMode,
  permissiveMode,
} from '#index.ts'

describe('Every mode each agent reports has one behaviour', () => {
  test.each([
    ['claude', 'default', 'asks'],
    ['claude', 'acceptEdits', 'asks'],
    ['claude', 'plan', 'unrelated'],
    ['claude', 'dontAsk', 'asks'],
    ['claude', 'auto', 'runs'],
    ['claude', 'bypassPermissions', 'runs'],
    ['codex', 'read-only', 'asks'],
    ['codex', 'agent', 'runs'],
    ['codex', 'agent-full-access', 'runs'],
    ['opencode', 'build', 'unrelated'],
    ['opencode', 'plan', 'unrelated'],
    ['opencode', 'hemera', 'unrelated'],
    ['hemera', HEMERA_AUTO_MODE, 'rules'],
  ])('%s in %s: %s', (agent, mode, behaviour) => {
    expect(modeBehaviour({ agent, mode })).toBe(behaviour)
  })

  test('an unknown mode, an unknown agent and no mode ask', () => {
    expect(modeBehaviour({ agent: 'claude', mode: 'something-new' })).toBe('asks')
    expect(modeBehaviour({ agent: 'someone-else', mode: 'auto' })).toBe('asks')
    expect(modeBehaviour(null)).toBe('asks')
  })
})

describe('Hemera Auto governs the permission modes the adapters declare', () => {
  test('a permission mode is one the table says asks or runs, never a planning mode or an agent', () => {
    expect(permissionMode('claude', 'acceptEdits')).toBe(true)
    expect(permissionMode('claude', 'bypassPermissions')).toBe(true)
    expect(permissionMode('claude', 'plan')).toBe(false)
    expect(permissionMode('codex', 'agent')).toBe(true)
    expect(permissionMode('codex', 'read-only')).toBe(true)
    // OpenCode's mode is which agent answers: Hemera Auto leaves it alone.
    for (const mode of ['build', 'plan', 'hemera']) {
      expect(permissionMode('opencode', mode)).toBe(false)
    }
    expect(permissionMode('claude', 'something-new')).toBe(false)
  })

  test('only the modes that run without asking are permissive', () => {
    expect(permissiveMode('claude', 'auto')).toBe(true)
    expect(permissiveMode('claude', 'default')).toBe(false)
    expect(permissiveMode('codex', 'agent-full-access')).toBe(true)
    expect(permissiveMode('codex', 'read-only')).toBe(false)
    expect(permissiveMode('opencode', 'build')).toBe(false)
  })

  test("each agent's neutral mode is the one it asks in first, and OpenCode has none", () => {
    expect(neutralMode('claude')).toBe('default')
    expect(neutralMode('codex')).toBe('read-only')
    expect(neutralMode('opencode')).toBeNull()
    expect(neutralMode('someone-else')).toBeNull()
  })
})

describe('One permission interaction across the three agents', () => {
  const mode = (value: string, values: readonly string[], id = 'mode') => ({
    id,
    category: 'mode',
    value,
    values: values.map((one) => ({ id: one })),
  })
  const effort = {
    id: 'effort',
    category: 'thought_level',
    value: 'high',
    values: [{ id: 'high' }],
  }

  test.each([
    ['claude', mode('bypassPermissions', ['default', 'acceptEdits', 'plan', 'bypassPermissions'])],
    ['claude', mode('acceptEdits', ['default', 'acceptEdits'])],
    ['codex', mode('agent-full-access', ['read-only', 'agent', 'agent-full-access'])],
  ])('%s is put back on its neutral mode before a prompt', (agent, option) => {
    expect(autoResets(agent, [option, effort])).toEqual({
      kind: 'ready',
      resets: [{ optionId: 'mode', value: agent === 'codex' ? 'read-only' : 'default' }],
    })
  })

  test.each([
    ['claude', mode('default', ['default', 'plan'])],
    ['claude', mode('plan', ['default', 'plan'])],
    ['codex', mode('read-only', ['read-only', 'agent'])],
    ['opencode', mode('hemera', ['build', 'plan', 'hemera'])],
    ['opencode', mode('build', ['build', 'plan', 'hemera'])],
  ])('%s on %j needs nothing', (agent, option) => {
    expect(autoResets(agent, [option, effort])).toEqual({ kind: 'ready', resets: [] })
  })

  test('an agent whose neutral mode is not offered is refused', () => {
    expect(autoResets('claude', [mode('acceptEdits', ['acceptEdits'])])).toEqual({
      kind: 'refused',
    })
    expect(autoResets('codex', [mode('agent', ['agent', 'agent-full-access'])])).toEqual({
      kind: 'refused',
    })
  })

  test('only a permission value of the mode option is governed, never effort or a plan', () => {
    const option = { id: 'mode', category: 'mode' }
    expect(autoGoverns('claude', option, 'auto')).toBe(true)
    expect(autoGoverns('claude', option, 'plan')).toBe(false)
    // The neutral mode is where Hemera Auto puts an agent: going back to it is always allowed,
    // which is how a plan is left.
    expect(autoGoverns('claude', option, 'default')).toBe(false)
    expect(autoGoverns('codex', option, 'read-only')).toBe(false)
    expect(autoGoverns('codex', option, 'agent')).toBe(true)
    expect(autoGoverns('opencode', option, 'build')).toBe(false)
    expect(autoGoverns('claude', { id: 'effort', category: 'thought_level' }, 'default')).toBe(
      false,
    )
  })
})
