/**
 * The start screen the window shows before a line of script has run (issues #185 and #140).
 *
 * The page carries it twice: in its `index.html`, which is on the first frame, and as the face the
 * application draws until its first page is ready. The first is a still of the second — the face's
 * loading dots as plain markup, turned by the stylesheet from the page's time origin — so the two
 * have to be one screen, or the window jumps between them. This reads the file and renders the
 * still, holds them to the same markup, and holds the still to the face's own frames: wherever the
 * turn has got to when the face mounts, the face draws its dots there.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vite-plus/test'

import { SIZE_CLASSES, detailOf } from '../src/components/face/face.tsx'
import { DETAILS, TUNING, createFace } from '../src/components/face/player.ts'
import { VIEW, drawnOf } from '../src/components/face/rig.ts'
import { face } from '../src/motion.ts'
import { StartFrame, StartScreen, startStrokes } from '../src/shell/start-screen.tsx'

const page = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'apps', 'desktop', 'src', 'renderer', 'index.html'),
  'utf8',
)

const theme = readFileSync(join(import.meta.dirname, '..', 'src', 'theme.css'), 'utf8')

/** What the root holds before the application mounts, without comments or space between tags. */
function rootOf(html: string): string {
  const inside = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html)?.[1] ?? ''
  return (
    inside
      .replaceAll(/<!--[\s\S]*?-->/g, '')
      .replaceAll(/>\s+</g, '><')
      // A tag the formatter spread over lines, its attributes put back on one.
      .replaceAll(/\s+/g, ' ')
      .replaceAll(/\s>/g, '>')
      .trim()
  )
}

/** A point turned about the middle of the face by `turns` of a full turn, clockwise on screen. */
function turned(x: number, y: number, turns: number): [number, number] {
  const middle = VIEW / 2
  const angle = 2 * Math.PI * turns
  const dx = x - middle
  const dy = y - middle
  return [
    middle + dx * Math.cos(angle) - dy * Math.sin(angle),
    middle + dx * Math.sin(angle) + dy * Math.cos(angle),
  ]
}

describe('The window starts on the face, loading', () => {
  test('the page holds the still of the face from its first paint', () => {
    expect(rootOf(page)).toBe(renderToStaticMarkup(createElement(StartFrame)))
  })

  test('the page sets the still turning from its own time origin', () => {
    // The script right after the root: what makes the stylesheet's turn and the face's orbit one
    // clock, so the face mounts where the still had got to.
    expect(page).toMatch(/<\/div>\s*<script>[\s\S]*getAnimations\(\)[\s\S]*startTime = 0/)
  })

  test('the still and the face are named alike and stand in the same box', () => {
    const still = renderToStaticMarkup(createElement(StartFrame))
    const live = renderToStaticMarkup(createElement(StartScreen))
    for (const markup of [still, live]) {
      expect(markup).toContain('role="img"')
      expect(markup).toContain('aria-label="Starting Hemera"')
      expect(markup).toContain('bg-background')
      expect(markup).toContain(SIZE_CLASSES.lg)
    }
    expect(live).toContain('data-state="loading"')
  })

  test('the still turns on the beat the face orbits on', () => {
    const turn = /--duration-turn:\s*(\d+)ms;/.exec(theme)?.[1]
    expect(Number(turn) / 1000).toBe(face.spin)
  })

  test('wherever the turn has got to, the face draws its dots where the still has them', () => {
    const detail = DETAILS[detailOf('lg')]
    const still = startStrokes()
    expect(still.map(([name]) => name)).toEqual(['left', 'right', 'mouth'])
    for (const seed of [0, 7, 123_456]) {
      for (const at of [0.08, 0.35, 0.9, 1.7]) {
        const live = createFace({
          state: 'loading',
          at,
          seed,
          detail,
          reduced: false,
          tuning: TUNING,
        })
        const layer = live.frame(at).layers[0]
        expect(layer).toBeDefined()
        if (layer === undefined) continue
        const drawn = drawnOf(layer.pose, detail)
        const strokes = [drawn.left, drawn.right, drawn.mouth]
        still.forEach(([, stroke], index) => {
          const now = strokes[index]
          expect(now).toBeTruthy()
          if (now === null || now === undefined) return
          const [ax, ay, , , cx, cy] = stroke.points
          const [lx, ly, , , mx, my] = now.points
          const [tx, ty] = turned((ax + cx) / 2, (ay + cy) / 2, at / face.spin)
          expect((lx + mx) / 2).toBeCloseTo(tx, 2)
          expect((ly + my) / 2).toBeCloseTo(ty, 2)
          expect(now.width).toBeCloseTo(stroke.width, 3)
        })
      }
    }
  })
})
