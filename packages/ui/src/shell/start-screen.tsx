import type { ReactNode } from 'react'

import { Face, detailOf } from '../components/face/face.tsx'
import { DETAILS, TUNING, createFace } from '../components/face/player.ts'
import { VIEW, drawnOf, pathOf, type DrawnStroke } from '../components/face/rig.ts'

/**
 * What the window shows while it starts: Hemera's face in its loading state, centred on the
 * page's own background, until the first page is ready (issues #185 and #140).
 *
 * The face is drawn by script, frame after frame, and the first paint comes before a line of
 * script has run. So the page writes a still of it by hand in its `index.html`: `StartFrame`, the
 * face's own first frame drawn as plain markup — the three dots of the loading, placed where the
 * face places them — turned by the stylesheet on the beat the face turns on. A line of script in
 * the page sets that turn going from the page's own time origin, which is the clock the face's
 * orbit is on, so when the application mounts `StartScreen` the face picks the dots up where the
 * stylesheet had them rather than jumping back to where it starts.
 *
 * The classes of the still are these, and they only exist in the stylesheet because this file
 * uses them. The background is the one the frame is painted with, so nothing flashes between the
 * frame, this screen and the first page.
 */
export const START_LABEL = 'Starting Hemera'

const SCREEN = 'flex h-screen items-center justify-center bg-background text-muted-foreground'

/** The size the face is drawn at on the start screen. */
const SIZE = 'lg'

/** The box the face stands in, as `Face` draws it at `lg`: a test holds the two together. */
const FRAME = 'inline-block shrink-0 size-16'

/** The live face, which the application draws until its first page is ready. */
export function StartScreen(): ReactNode {
  return (
    <div className={SCREEN}>
      <Face state="loading" size={SIZE} label={START_LABEL} />
    </div>
  )
}

/**
 * The face's strokes at the moment its loading begins, on a clock at zero, by name.
 *
 * The same for any seed: the loading's first stretch is its plain width and its plain beat, so
 * it is drawn with none in particular.
 */
export function startStrokes(): readonly (readonly [string, DrawnStroke])[] {
  const detail = DETAILS[detailOf(SIZE)]
  const face = createFace({
    state: 'loading',
    at: 0,
    seed: 0,
    detail,
    reduced: false,
    tuning: TUNING,
  })
  const layer = face.frame(0).layers[0]
  if (layer === undefined) return []
  const drawn = drawnOf(layer.pose, detail)
  const named: [string, DrawnStroke | null][] = [
    ['left', drawn.left],
    ['right', drawn.right],
    ['mouth', drawn.mouth],
  ]
  const drawnOnes: [string, DrawnStroke][] = []
  for (const [name, stroke] of named) if (stroke !== null) drawnOnes.push([name, stroke])
  return drawnOnes
}

/**
 * The start screen as plain markup, for the page's first paint: a still of the face, turned by
 * the stylesheet. Written out in `index.html`, and held to it by a test.
 */
export function StartFrame(): ReactNode {
  return (
    <div className={SCREEN}>
      <span role="img" aria-label={START_LABEL} title={START_LABEL} className={FRAME}>
        <span className="block size-full motion-safe:animate-turn">
          <svg
            viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
            fill="none"
            aria-hidden="true"
            className="size-full overflow-visible"
          >
            <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              {startStrokes().map(([name, stroke]) => (
                <path
                  key={name}
                  d={pathOf(stroke)}
                  strokeWidth={Math.round(stroke.width * 1000) / 1000}
                />
              ))}
            </g>
          </svg>
        </span>
      </span>
    </div>
  )
}
