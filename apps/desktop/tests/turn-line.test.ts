/**
 * The row above the box is the design system's `TurnLine`, and the page draws it (issue #170).
 *
 * The page imports the design system's components, which need a browser, so what is read here is
 * its source: the stories of `TurnLine` — the meter that stays at the foot of the row while the
 * thought opens above it — are the proof of the row only if the page draws that component rather
 * than a copy of its layout.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'renderer', 'pages', 'session.tsx'),
  'utf8',
)

describe('The session page draws its turn line with TurnLine', () => {
  test('the row above the box is TurnLine, with no copy of its layout around it', () => {
    expect(PAGE).toContain('<TurnLine')
    // The two halves of the row are TurnLine's to lay out, and nothing of the page draws them.
    expect(PAGE).not.toContain('<ActivityRow')
    expect(PAGE).not.toContain('<UsageMeter')
    expect(PAGE).not.toContain('justify-between')
  })
})
