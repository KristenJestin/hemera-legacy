/**
 * What the window sends about a build's review rounds (issue #278): it reads them, and adds and
 * withdraws the user's feedback. Nothing it can send opens, moves or closes a round, or clears a
 * stale mark: the declaration is where that is held, so it is what is under test here.
 */

import { describe, expect, test } from 'vite-plus/test'

import { CHANNELS, ENGINE_REQUESTS, feedbackAnchorSchema, reviewRoundViewSchema } from '#index.ts'

describe('The window reaches the review rounds by name', () => {
  test('reading, adding and withdrawing feedback are the only review use cases, each a channel', () => {
    const names = Object.keys(ENGINE_REQUESTS).filter((name) => name.startsWith('review.'))
    expect(names).toEqual(['review.read', 'review.addFeedback', 'review.withdrawFeedback'])
    for (const name of names) expect(Object.hasOwn(CHANNELS, name)).toBe(true)
  })

  test('a feedback points at a story or a criterion of the Spec, at lines of the code, or at nothing', () => {
    const add = ENGINE_REQUESTS['review.addFeedback'].arguments
    const base = { sessionId: 's', kind: 'product', body: 'The header is dropped.' }
    expect(add.safeParse({ ...base, anchor: null }).success).toBe(true)
    expect(
      add.safeParse({ ...base, anchor: { kind: 'spec', storyId: 'story-1', criterion: 0 } })
        .success,
    ).toBe(true)
    expect(
      feedbackAnchorSchema.safeParse({
        kind: 'code',
        repository: 'sources/api',
        path: 'README.md',
        lines: { start: 1, end: 2 },
        side: 'new',
      }).success,
    ).toBe(true)
    expect(add.safeParse({ ...base, kind: 'praise', anchor: null }).success).toBe(false)
  })

  test('a round is a review of the Spec or of the code, open, fixing or closed', () => {
    const round = {
      id: 'r',
      number: 1,
      kind: 'code',
      state: 'fixing',
      openedAt: 'a',
      fixingAt: 'b',
      closedAt: null,
      stale: false,
      repositories: [],
      feedback: [],
    }
    expect(reviewRoundViewSchema.safeParse(round).success).toBe(true)
    expect(reviewRoundViewSchema.safeParse({ ...round, kind: 'design' }).success).toBe(false)
  })
})
