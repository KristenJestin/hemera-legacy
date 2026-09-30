import { type ReactNode, createElement as h, useId } from 'react'

import type { FaceDetail } from '../face/player.ts'
import { poseOf } from '../face/pose.ts'
import { type DrawnStroke, VIEW, drawnOf, pathOf } from '../face/rig.ts'
import { EYES, MOUTHS, mirrored } from '../face/strokes.ts'

/**
 * Hemera's application icon (issue #267): its face at rest on a rounded tile — white on a
 * fuchsia tile for the release, fuchsia on a white tile inside a fuchsia ring for the beta.
 *
 * The face is the face's own: the chevron eyes and the level mouth of `strokes.ts`, laid out by
 * the head of `rig.ts`, so a change to the face is a change to the icon. The packaged PNGs and
 * the Windows `.ico` are drawn from this component when a package is built
 * (`tools/app-icons.ts`), never by hand and never committed.
 *
 * Written with `createElement` rather than JSX: the packaging tool runs on Node, which strips
 * types from a `.ts` file but does not compile JSX.
 *
 * An icon is a picture and not a surface of the interface: it is the same on every theme and
 * every launcher, so its colours are fixed. Each is a role of the theme, named beside it, and a
 * repository test keeps the two equal.
 */

/** A colour of the icon, and the role of the theme it is taken from. */
export interface IconTone {
  readonly value: string
  readonly role: string
  readonly theme: 'light' | 'dark'
}

export const APP_ICON_TONES = {
  /** The tile, from the dark theme's strong fuchsia down to the light theme's. */
  tileTop: { value: '#d946ef', role: 'primary-strong', theme: 'dark' },
  tileBottom: { value: '#a21caf', role: 'primary-strong', theme: 'light' },
  /** The face on the release's tile. */
  face: { value: '#ffffff', role: 'primary-foreground', theme: 'light' },
  /** The beta's tile inside its ring, and its face. */
  paper: { value: '#ffffff', role: 'card', theme: 'light' },
  ink: { value: '#c026d3', role: 'primary', theme: 'light' },
} as const satisfies Record<string, IconTone>

/** Which package the icon is for: the release, or the beta a reader runs every day. */
export type AppIconChannel = 'prod' | 'beta'

/** The side of the square every drawing is laid on. */
export const ICON_VIEW = 1024

/**
 * Two drawings of one icon: the master, from 48 px up, and one redrawn for 16 to 32 px, where
 * the master's strokes would melt into each other — a fuller tile, a larger face, heavier lines.
 */
export type IconDrawing = 'master' | 'small'

/** The largest size drawn from the small drawing. */
export const SMALL_UP_TO = 32

export function drawingFor(size: number): IconDrawing {
  return size <= SMALL_UP_TO ? 'small' : 'master'
}

interface Layout {
  /** Where the tile starts, its side and its corner. */
  readonly inset: number
  readonly side: number
  readonly radius: number
  /** How many icon units one unit of the face's own square is. */
  readonly faceScale: number
  /** The face's own detail: how heavy its strokes are drawn. */
  readonly detail: FaceDetail
  /** The beta's ring: at 16 px it is still more than a pixel and a half. */
  readonly ring: number
  /** The beta's face, drawn smaller inside the ring so a pixel of white stays between them. */
  readonly ringFaceScale: number
  /** And heavier, since fuchsia on white is a lighter stroke to the eye than white on fuchsia. */
  readonly ringDetail: FaceDetail
}

const LAYOUTS: Record<IconDrawing, Layout> = {
  master: {
    inset: 64,
    side: 896,
    radius: 200,
    faceScale: 22,
    detail: { mouth: true, scale: 1, weight: 1.05, gain: 1, asides: false },
    ring: 64,
    ringFaceScale: 22,
    ringDetail: { mouth: true, scale: 1, weight: 1.05, gain: 1, asides: false },
  },
  small: {
    inset: 32,
    side: 960,
    radius: 224,
    faceScale: 26,
    detail: { mouth: true, scale: 1, weight: 1.25, gain: 1, asides: false },
    ring: 112,
    ringFaceScale: 22,
    ringDetail: { mouth: true, scale: 1, weight: 1.6, gain: 1, asides: false },
  },
}

/** The face at rest: the mark's chevron eyes and the level mouth, looking straight ahead. */
const REST = poseOf({
  left: EYES.chevron,
  right: mirrored(EYES.chevron),
  mouth: MOUTHS.line,
  lidLeft: 0,
  lidRight: 0,
  head: { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0 },
  orbit: 0,
  spin: 0,
  reach: 0,
  tone: 'current',
})

function faceOf(detail: FaceDetail, scale: number, color: string): ReactNode {
  const drawn = drawnOf(REST, detail)
  const strokes = [drawn.left, drawn.right, drawn.mouth].filter(
    (stroke): stroke is DrawnStroke => stroke !== null,
  )
  const half = VIEW / 2
  return h(
    'g',
    {
      transform: `translate(${String(ICON_VIEW / 2)} ${String(ICON_VIEW / 2)}) scale(${String(scale)}) translate(${String(-half)} ${String(-half)})`,
      fill: 'none',
      stroke: color,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    strokes.map((stroke, index) =>
      h('path', { key: index, d: pathOf(stroke), strokeWidth: stroke.width }),
    ),
  )
}

export interface AppIconProps {
  /** The package it stands for. */
  readonly channel: AppIconChannel
  /** The size in pixels it is drawn at, which also picks the drawing. */
  readonly size: number
  /** What it says to whoever cannot see it; left out, it is decoration. */
  readonly label?: string | undefined
}

/** Hemera's icon for a package's channel, at a size in pixels. */
export function AppIcon({ channel, size, label }: AppIconProps): ReactNode {
  const id = `icon${useId().replaceAll(/[^\w-]/g, '')}`
  const layout = LAYOUTS[drawingFor(size)]
  const { inset, side, radius, ring } = layout
  const T = APP_ICON_TONES
  const beta = channel === 'beta'

  const gradient = h(
    'linearGradient',
    { id: `${id}-tile`, x1: 0, y1: 0, x2: 0, y2: 1 },
    h('stop', { offset: 0, stopColor: T.tileTop.value }),
    h('stop', { offset: 1, stopColor: T.tileBottom.value }),
  )

  // The beta is the release's tile turned inside out: the fuchsia goes round it as a ring, and
  // the face takes the colour the tile gave up.
  const tile = beta
    ? h('rect', {
        x: inset + ring / 2,
        y: inset + ring / 2,
        width: side - ring,
        height: side - ring,
        rx: radius - ring / 2,
        fill: T.paper.value,
        stroke: `url(#${id}-tile)`,
        strokeWidth: ring,
      })
    : h('rect', {
        x: inset,
        y: inset,
        width: side,
        height: side,
        rx: radius,
        fill: `url(#${id}-tile)`,
      })

  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${String(ICON_VIEW)} ${String(ICON_VIEW)}`,
      width: size,
      height: size,
      ...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }),
      'data-app-icon': channel,
      'data-drawing': drawingFor(size),
    },
    h('defs', null, gradient),
    tile,
    beta
      ? faceOf(layout.ringDetail, layout.ringFaceScale, T.ink.value)
      : faceOf(layout.detail, layout.faceScale, T.face.value),
  )
}
