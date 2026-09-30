/**
 * The pure rules of a review round (issue #278): what an open round refuses the build's agent, how
 * a round moves, and when the user may add or withdraw feedback. Each suite is named after the
 * scenario it covers.
 */

import { describe, expect, test } from 'vite-plus/test'

import {
  FEEDBACK_KINDS,
  ROUND_KINDS,
  ROUND_STATES,
  TOOL_NAMES,
  anchorRefusal,
  feedbackRefusal,
  roundAcceptRefusal,
  roundMoveRefusal,
  roundName,
  roundToolRefusal,
  waitsForFix,
} from '#index.ts'

describe('A write is refused while a round is open', () => {
  test('writing a file, editing one and running a command are refused, with the reason', () => {
    for (const tool of ['fs_write', 'fs_edit', 'commands_run'] as const) {
      expect(roundToolRefusal('open', tool)).toMatch(/review round/)
    }
  })

  test('reading, listing, searching and every other tool still go through', () => {
    const held = new Set(['fs_write', 'fs_edit', 'commands_run'])
    for (const tool of TOOL_NAMES.filter((name) => !held.has(name))) {
      expect(roundToolRefusal('open', tool)).toBeNull()
    }
  })

  test('a round being fixed, a closed one, or none at all refuses nothing', () => {
    expect(roundToolRefusal('fixing', 'fs_write')).toBeNull()
    expect(roundToolRefusal('closed', 'commands_run')).toBeNull()
    expect(roundToolRefusal(null, 'fs_edit')).toBeNull()
  })
})

describe('A round moves forward only', () => {
  test('open goes to fixing or closed, fixing goes to closed, and nothing comes back', () => {
    expect(ROUND_STATES).toEqual(['open', 'fixing', 'closed'])
    expect(roundMoveRefusal('open', 'fixing')).toBeNull()
    expect(roundMoveRefusal('open', 'closed')).toBeNull()
    expect(roundMoveRefusal('fixing', 'closed')).toBeNull()
    expect(roundMoveRefusal('fixing', 'open')).not.toBeNull()
    expect(roundMoveRefusal('closed', 'open')).not.toBeNull()
    expect(roundMoveRefusal('closed', 'fixing')).not.toBeNull()
    expect(roundMoveRefusal('open', 'open')).not.toBeNull()
  })
})

describe('Feedback accumulates on an open round', () => {
  test('its three kinds are product, general and question', () => {
    expect(FEEDBACK_KINDS).toEqual(['product', 'general', 'question'])
  })

  test('an open round takes feedback; a round being fixed or closed does not', () => {
    expect(feedbackRefusal('open', 'The export drops the header.')).toBeNull()
    expect(feedbackRefusal('fixing', 'Too late.')).toMatch(/being fixed/)
    expect(feedbackRefusal('closed', 'Too late.')).toMatch(/closed/)
    expect(feedbackRefusal(null, 'Nothing to review.')).toMatch(/no review round/)
  })

  test('an empty feedback is refused', () => {
    expect(feedbackRefusal('open', '   \n')).toMatch(/empty/)
  })
})

describe('A round reviews the Spec now, and the code later', () => {
  test('the two kinds are spec and code', () => {
    expect(ROUND_KINDS).toEqual(['spec', 'code'])
  })
})

/** A frozen revision with one story of two criteria. */
const REVISION = {
  stories: [
    {
      id: 's1',
      revisionId: 'r1',
      title: 'Export',
      narrative: 'As a user, I export.',
      priority: null,
      rank: 'a',
    },
  ],
  criteria: [
    { id: 'c1', storyId: 's1', body: 'A file is written', rank: 'a' },
    { id: 'c2', storyId: 's1', body: 'The header is kept', rank: 'b' },
  ],
}

describe('A feedback of a Spec review may point at a story or a criterion', () => {
  test('no anchor, a story, or one of its criteria by index is taken, whatever the kind', () => {
    expect(anchorRefusal('spec', null, REVISION)).toBeNull()
    expect(
      anchorRefusal('spec', { kind: 'spec', storyId: 's1', criterion: null }, REVISION),
    ).toBeNull()
    expect(
      anchorRefusal('spec', { kind: 'spec', storyId: 's1', criterion: 1 }, REVISION),
    ).toBeNull()
  })

  test('a story of another revision, or a criterion the story does not have, is refused', () => {
    expect(
      anchorRefusal('spec', { kind: 'spec', storyId: 'elsewhere', criterion: null }, REVISION),
    ).toMatch(/not one of the frozen revision/)
    expect(anchorRefusal('spec', { kind: 'spec', storyId: 's1', criterion: 2 }, REVISION)).toMatch(
      /2 criteria/,
    )
  })

  test('a code anchor is refused on a Spec review, and taken on a code review', () => {
    const line = {
      kind: 'code' as const,
      repository: 'sources/api',
      path: 'README.md',
      lines: { start: 3, end: 5 },
      side: 'new' as const,
    }
    expect(anchorRefusal('spec', line, REVISION)).toMatch(/spec round takes no code anchor/)
    expect(anchorRefusal('code', line, REVISION)).toBeNull()
    expect(anchorRefusal('code', { ...line, lines: { start: 5, end: 3 } }, REVISION)).toMatch(
      /no range/,
    )
  })
})

describe('A round is named after its kind and its number', () => {
  test('Spec review · round n, and a code round the same way', () => {
    expect(roundName('spec', 1)).toBe('Spec review · round 1')
    expect(roundName('spec', 3)).toBe('Spec review · round 3')
    expect(roundName('code', 2)).toBe('Code review · round 2')
  })
})

describe('Accept is refused on a stale round', () => {
  const round = { state: 'open' as const, stale: false, feedback: [] }
  const product = { kind: 'product' as const, withdrawnAt: null }

  test('an open round, not stale, with no feedback waiting for a fix, is accepted', () => {
    expect(roundAcceptRefusal(round)).toBeNull()
  })

  test('no round open, a round being fixed, a stale round: each is refused with its reason', () => {
    expect(roundAcceptRefusal(null)).toBe('No review round is open.')
    expect(roundAcceptRefusal({ ...round, state: 'fixing' })).toBe(
      'The feedback of the round is being fixed.',
    )
    expect(roundAcceptRefusal({ ...round, state: 'closed' })).toBe('No review round is open.')
    expect(roundAcceptRefusal({ ...round, stale: true })).toBe(
      'The Workspace changed since the round opened.',
    )
  })

  test('a product or general feedback waits for a fix; a question or a withdrawn one does not', () => {
    expect(roundAcceptRefusal({ ...round, feedback: [product] })).toBe(
      'A feedback waits for a fix.',
    )
    expect(
      roundAcceptRefusal({ ...round, feedback: [{ kind: 'general', withdrawnAt: null }] }),
    ).toBe('A feedback waits for a fix.')
    expect(
      roundAcceptRefusal({
        ...round,
        feedback: [
          { kind: 'question', withdrawnAt: null },
          { kind: 'product', withdrawnAt: '2026-09-30T10:00:00.000Z' },
        ],
      }),
    ).toBeNull()
    expect(waitsForFix([product])).toBe(true)
    expect(waitsForFix([{ kind: 'question', withdrawnAt: null }])).toBe(false)
  })
})
