/**
 * What a helper's avatar says (issue #77): its initial, or two letters when another helper of the
 * Session shares that initial, and a colour of its own read from its name, so it never changes as
 * other helpers come and go. The avatar itself is a browser story; what is proved here is the part
 * that chooses.
 */

import { describe, expect, test } from 'vite-plus/test'

import { HELPER_TONES, helperInitialsOf, helperToneOf } from '../src/session/helper-avatar.tsx'

describe('the letters of a helper’s avatar', () => {
  test('a helper alone with its initial wears that initial, in capitals', () => {
    expect(helperInitialsOf('reviewer', [])).toBe('R')
    expect(helperInitialsOf('Reviewer', ['Documenter', 'Prototyper'])).toBe('R')
  })

  test('two helpers that share an initial wear two letters each', () => {
    expect(helperInitialsOf('Reviewer', ['Researcher'])).toBe('RE')
    expect(helperInitialsOf('Researcher', ['Reviewer'])).toBe('RE')
    // Two words: the first letter of each.
    expect(helperInitialsOf('Security reviewer', ['Scout'])).toBe('SR')
  })

  test('the initial is shared whatever its case', () => {
    expect(helperInitialsOf('scout', ['Security reviewer'])).toBe('SC')
  })
})

describe('the colour of a helper’s avatar', () => {
  test('the same name wears the same tone, whoever else is there', () => {
    expect(helperToneOf('Reviewer')).toBe(helperToneOf('Reviewer'))
    expect(HELPER_TONES).toContain(helperToneOf('Reviewer'))
  })

  test('names are spread over the tones rather than piled on one', () => {
    const names = ['Reviewer', 'Security', 'Documenter', 'Prototyper', 'Explore', 'Scout', 'Tester']
    expect(new Set(names.map(helperToneOf)).size).toBeGreaterThan(2)
  })
})
