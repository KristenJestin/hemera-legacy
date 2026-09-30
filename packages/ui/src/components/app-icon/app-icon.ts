import { type ReactNode, createElement as h, useId } from 'react'

import type { FaceDetail } from '../face/player.ts'
import { poseOf } from '../face/pose.ts'
import { type DrawnStroke, VIEW, drawnOf, pathOf } from '../face/rig.ts'
import { EYES, MOUTHS, mirrored } from '../face/strokes.ts'

/**
 * Hemera's application icon (issue #267): its face at rest on a rounded tile.
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
  /** The face on the tile. */
  face: { value: '#ffffff', role: 'primary-foreground', theme: 'light' },
  /** Beta · Cyan: the tile in the colour of a build. */
  cyanTop: { value: '#0891b2', role: 'mission-build', theme: 'light' },
  cyanBottom: { value: '#0e7490', role: 'mission-build-muted-foreground', theme: 'light' },
  /** Beta · Badge: an amber disc in the corner, and the β written on it. */
  badge: { value: '#fbbf24', role: 'warning', theme: 'dark' },
  badgeInk: { value: '#111118', role: 'foreground', theme: 'light' },
  /** Beta · Outline: a white tile inside the fuchsia, the face in fuchsia. */
  paper: { value: '#ffffff', role: 'card', theme: 'light' },
  ink: { value: '#c026d3', role: 'primary', theme: 'light' },
} as const satisfies Record<string, IconTone>

/** Which package the icon is for: the release, or the beta a reader runs every day. */
export type AppIconChannel = 'prod' | 'beta'

/**
 * Every drawing the icon has. The stable one, and the three proposals for the beta the
 * exploration `Explorations/App icon` shows side by side; the two not chosen go once one is.
 */
export const APP_ICON_LOOKS = ['stable', 'beta-cyan', 'beta-badge', 'beta-outline'] as const

export type AppIconLook = (typeof APP_ICON_LOOKS)[number]

/** The drawing a beta package wears, until the exploration's choice replaces the others. */
export const BETA_LOOK: AppIconLook = 'beta-cyan'

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
  /** The ring of the outlined tile. */
  readonly ring: number
  /** The badge's disc, and the gap cut around it in the tile. */
  readonly badge: { readonly at: number; readonly radius: number; readonly gap: number }
}

const LAYOUTS: Record<IconDrawing, Layout> = {
  master: {
    inset: 64,
    side: 896,
    radius: 200,
    faceScale: 22,
    detail: { mouth: true, scale: 1, weight: 1.05, gain: 1, asides: false },
    ring: 64,
    badge: { at: 816, radius: 150, gap: 196 },
  },
  small: {
    inset: 32,
    side: 960,
    radius: 224,
    faceScale: 26,
    detail: { mouth: true, scale: 1, weight: 1.25, gain: 1, asides: false },
    ring: 104,
    badge: { at: 812, radius: 180, gap: 230 },
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

/** The β, drawn as a stroke on a disc of radius 100 centred on the origin. */
const BETA_GLYPH =
  'M-26 64V-28C-26 -60 32 -62 32 -30C32 -10 12 -4 -4 -4C42 -4 46 52 4 52C-10 52 -20 46 -26 38'

function faceOf(layout: Layout, color: string): ReactNode {
  const drawn = drawnOf(REST, layout.detail)
  const strokes = [drawn.left, drawn.right, drawn.mouth].filter(
    (stroke): stroke is DrawnStroke => stroke !== null,
  )
  const half = VIEW / 2
  return h(
    'g',
    {
      transform: `translate(${String(ICON_VIEW / 2)} ${String(ICON_VIEW / 2)}) scale(${String(layout.faceScale)}) translate(${String(-half)} ${String(-half)})`,
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

function gradientOf(id: string, top: IconTone, bottom: IconTone): ReactNode {
  return h(
    'linearGradient',
    { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    h('stop', { offset: 0, stopColor: top.value }),
    h('stop', { offset: 1, stopColor: bottom.value }),
  )
}

export interface AppIconDrawingProps {
  readonly look: AppIconLook
  /** The size in pixels it is drawn at, which also picks the drawing. */
  readonly size: number
  /** What it says to whoever cannot see it; left out, it is decoration. */
  readonly label?: string | undefined
}

/** One of the icon's drawings, at a size. */
export function AppIconDrawing({ look, size, label }: AppIconDrawingProps): ReactNode {
  const id = `icon${useId().replaceAll(/[^\w-]/g, '')}`
  const layout = LAYOUTS[drawingFor(size)]
  const { inset, side, radius } = layout
  const T = APP_ICON_TONES
  const cyan = look === 'beta-cyan'
  const outline = look === 'beta-outline'
  const badged = look === 'beta-badge'

  const defs = h(
    'defs',
    null,
    gradientOf(`${id}-tile`, cyan ? T.cyanTop : T.tileTop, cyan ? T.cyanBottom : T.tileBottom),
    badged &&
      h(
        'mask',
        { id: `${id}-cut` },
        h('rect', { width: ICON_VIEW, height: ICON_VIEW, fill: '#fff' }),
        h('circle', {
          cx: layout.badge.at,
          cy: layout.badge.at,
          r: layout.badge.gap,
          fill: '#000',
        }),
      ),
  )

  const tile = outline
    ? h('rect', {
        x: inset + layout.ring / 2,
        y: inset + layout.ring / 2,
        width: side - layout.ring,
        height: side - layout.ring,
        rx: radius - layout.ring / 2,
        fill: T.paper.value,
        stroke: `url(#${id}-tile)`,
        strokeWidth: layout.ring,
      })
    : h('rect', {
        x: inset,
        y: inset,
        width: side,
        height: side,
        rx: radius,
        fill: `url(#${id}-tile)`,
      })

  const face = faceOf(layout, outline ? T.ink.value : T.face.value)
  const body = h('g', badged ? { mask: `url(#${id}-cut)` } : null, tile, face)

  // The β only where it has room to be a letter: under 48 px it is a dot.
  const badge =
    badged &&
    h(
      'g',
      null,
      h('circle', {
        cx: layout.badge.at,
        cy: layout.badge.at,
        r: layout.badge.radius,
        fill: T.badge.value,
      }),
      drawingFor(size) === 'master' &&
        h('path', {
          d: BETA_GLYPH,
          transform: `translate(${String(layout.badge.at)} ${String(layout.badge.at)}) scale(${String(layout.badge.radius / 100)})`,
          fill: 'none',
          stroke: T.badgeInk.value,
          strokeWidth: 16,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
    )

  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${String(ICON_VIEW)} ${String(ICON_VIEW)}`,
      width: size,
      height: size,
      ...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }),
      'data-app-icon': look,
      'data-drawing': drawingFor(size),
    },
    defs,
    body,
    badge,
  )
}

export interface AppIconProps {
  readonly channel: AppIconChannel
  readonly size: number
  readonly label?: string | undefined
}

/** Hemera's icon for a package's channel, at a size in pixels. */
export function AppIcon({ channel, size, label }: AppIconProps): ReactNode {
  return h(AppIconDrawing, { look: channel === 'prod' ? 'stable' : BETA_LOOK, size, label })
}
