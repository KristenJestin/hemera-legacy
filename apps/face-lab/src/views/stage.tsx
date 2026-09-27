import {
  AT,
  EXPRESSIONS,
  type FaceAct,
  type FaceFrame,
  FaceFigure,
  type FacePainter,
  type FaceSize,
  type FaceState,
  SIZE_CLASSES,
  TONES,
  VIEW,
  drawnOf,
  tonesOf,
} from '@hemera/ui/face'
import { Button } from '@hemera/ui'
import { cn } from 'cn'
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react'

import { signed } from '../controls.tsx'
import { useSprite } from '../sprites.tsx'
import { type Played, type Telling, detailFor, lengthOf, playerOver, replay } from '../story.ts'

/** How much bigger than itself the face on the stage is drawn, to be looked at closely. */
export const MAGNIFY = { 1: 'scale-100', 2: 'scale-200', 3: 'scale-300', 4: 'scale-400' } as const

export type Magnify = keyof typeof MAGNIFY

/** The surfaces of the theme the face can be judged on. */
export const GROUNDS = {
  content: 'bg-surface-content',
  page: 'bg-surface-page',
  rim: 'bg-surface-rim',
  body: 'bg-surface-body',
} as const

export type Ground = keyof typeof GROUNDS

/** A swatch of each tone, for the readout: the same roles the face is drawn in. */
const SWATCHES = {
  quiet: 'bg-muted-foreground',
  busy: 'bg-primary',
  build: 'bg-mission-build',
  needs: 'bg-warning',
  good: 'bg-success',
  bad: 'bg-destructive',
} as const satisfies Record<(typeof TONES)[number], string>

/** How many pictures the strip under the stage cuts the last change into. */
const CUTS = 14

export interface StageProps {
  readonly history: readonly Played[]
  readonly telling: Telling
  readonly size: FaceSize
  readonly magnify: Magnify
  readonly ground: Ground
  readonly guides: boolean
  /** The state the face is in, whose own animations can be played on demand. */
  readonly state: FaceState
  readonly onAct: (act: FaceAct) => void
}

/** What a state plays, each of which can be asked for now: its blink, its gestures, its flourish. */
function actsOf(state: FaceState): { readonly label: string; readonly act: FaceAct }[] {
  const { blink, motion, aside, flourish } = EXPRESSIONS[state]
  return [
    ...(blink === null ? [] : [{ label: 'Blink', act: { kind: 'blink' } as const }]),
    { label: `Gesture · ${motion}`, act: { kind: 'gesture', motion } as const },
    ...(aside === null
      ? []
      : [
          {
            label: `Borrowed · ${aside.motion}`,
            act: { kind: 'gesture', motion: aside.motion } as const,
          },
        ]),
    ...(flourish === null
      ? []
      : [{ label: `Flourish · ${flourish}`, act: { kind: 'flourish', flourish } as const }]),
  ]
}

/** The animations of the state the face is in, each played on demand. */
function Acts({ state, onAct }: { state: FaceState; onAct: (act: FaceAct) => void }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">Play now</span>
      {actsOf(state).map((one) => (
        <Button key={one.label} size="sm" onClick={() => onAct(one.act)}>
          {one.label}
        </Button>
      ))}
    </div>
  )
}

/** Something drawn beside the face, and what paints it on every frame. */
interface Overlay<Paint> {
  readonly view: ReactNode
  readonly paint: Paint
}

/** Draws the three points of every stroke and the point the head turns about, frame by frame. */
function useGuides(): Overlay<(frame: FaceFrame, telling: Telling) => void> {
  const points = useRef<(SVGCircleElement | null)[]>([])
  const pivot = useRef<SVGCircleElement | null>(null)
  const view = (
    <svg
      viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <rect
        x="0"
        y="0"
        width={VIEW}
        height={VIEW}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.1"
        strokeDasharray="0.4 0.6"
        className="text-border"
      />
      {Array.from({ length: 9 }, (_, index) => (
        <circle
          key={index}
          ref={(node) => {
            points.current[index] = node
          }}
          r="0.45"
          fill="currentColor"
          className={index % 3 === 1 ? 'text-warning' : 'text-info'}
        />
      ))}
      <circle
        ref={pivot}
        r="0.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.2"
        className="text-success"
      />
    </svg>
  )
  const paint = (frame: FaceFrame, telling: Telling): void => {
    const layer = frame.layers.at(-1)
    if (layer === undefined) return
    const drawn = drawnOf(layer.pose, detailFor(telling), telling.tuning.gain)
    const strokes = [drawn.left, drawn.right, drawn.mouth]
    strokes.forEach((stroke, index) => {
      for (let point = 0; point < 3; point += 1) {
        const circle = points.current[index * 3 + point] ?? null
        if (circle === null) continue
        if (stroke === null) {
          circle.setAttribute('display', 'none')
          continue
        }
        circle.removeAttribute('display')
        circle.setAttribute('cx', String(stroke.points[point * 2]))
        circle.setAttribute('cy', String(stroke.points[point * 2 + 1]))
      }
    })
    pivot.current?.setAttribute('cx', String(drawn.pivot[0]))
    pivot.current?.setAttribute('cy', String(drawn.pivot[1]))
  }
  return { view, paint }
}

/** What the face is doing, said in numbers, frame by frame. */
function useReadout(): Overlay<(frame: FaceFrame, at: number) => void> {
  const fields = useRef(new Map<string, HTMLElement>())
  const meters = useRef(new Map<string, HTMLMeterElement>())
  const field = (name: string): ReactNode => (
    <span
      className="font-mono"
      ref={(node) => {
        if (node === null) fields.current.delete(name)
        else fields.current.set(name, node)
      }}
    />
  )
  const row = (label: string, name: string): ReactNode => (
    <div key={name} className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {field(name)}
    </div>
  )
  const view = (
    <div className="flex flex-col gap-1 text-xs">
      {row('Time', 'time')}
      {row('State', 'state')}
      {row('Change', 'change')}
      <meter
        min={0}
        max={1}
        aria-label="How far the change is"
        ref={(node) => {
          if (node !== null) meters.current.set('change', node)
        }}
        className="w-full"
      />
      {row('Gesture', 'motion')}
      {row('Flourish', 'flourish')}
      {row('Yaw · pitch', 'head')}
      {row('Gaze', 'gaze')}
      {row('Lids', 'lids')}
      <div className="mt-2 flex flex-col gap-1">
        {TONES.map((tone) => (
          <div key={tone} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', SWATCHES[tone])} />
            <span className="w-12 text-muted-foreground">{tone}</span>
            <meter
              min={0}
              max={1}
              aria-label={`Share of ${tone}`}
              ref={(node) => {
                if (node !== null) meters.current.set(tone, node)
              }}
              className="w-full"
            />
          </div>
        ))}
      </div>
    </div>
  )
  const say = (name: string, text: string): void => {
    const node = fields.current.get(name)
    if (node !== undefined && node.textContent !== text) node.textContent = text
  }
  const paint = (frame: FaceFrame, at: number): void => {
    const pose = frame.layers.at(-1)?.pose
    say('time', `${at.toFixed(2)} s`)
    say('state', EXPRESSIONS[frame.state].label)
    say('change', frame.change === null ? '—' : frame.change.name)
    const change = meters.current.get('change')
    if (change !== undefined) change.value = frame.change?.progress ?? 0
    say('motion', frame.motion ?? '—')
    say('flourish', frame.flourish ?? '—')
    if (pose === undefined) return
    say('head', [AT.yaw, AT.pitch].map((index) => signed(pose[index]!)).join(' '))
    say('gaze', [AT.gazeX, AT.gazeY].map((index) => signed(pose[index]!)).join(' '))
    say('lids', [AT.lidLeft, AT.lidRight].map((index) => pose[index]!.toFixed(2)).join(' '))
    tonesOf(pose).forEach((weight, index) => {
      const meter = meters.current.get(TONES[index]!)
      if (meter !== undefined) meter.value = weight
    })
  }
  return { view, paint }
}

/** One frame of a story, painted once. */
export function Still({ frame, telling }: { frame: FaceFrame; telling: Telling }): ReactNode {
  const painter = useRef<FacePainter | null>(null)
  useLayoutEffect(() => {
    painter.current?.paint(frame)
  }, [frame])
  return (
    <span className="size-12 shrink-0">
      <FaceFigure detail={detailFor(telling)} gain={telling.tuning.gain} painter={painter} />
    </span>
  )
}

/**
 * The last change, cut into pictures at even moments: from just before it came to just after it
 * landed, the way an animator lays out the frames of a move to judge it.
 */
function Strip({ history, telling }: { history: readonly Played[]; telling: Telling }): ReactNode {
  const cuts = useMemo(() => {
    const changes = history.filter((played) => played.act === undefined)
    const last = changes.length - 1
    if (last < 1) return []
    const from = changes[last - 1]!
    const to = changes[last]!
    const player = replay(history, telling)
    const length = lengthOf(from.state, to.state, telling.tuning)
    const start = to.at - 0.1
    const span = length + 0.3
    return Array.from({ length: CUTS }, (_, index) => {
      const at = start + (span * index) / (CUTS - 1)
      return { at, frame: player.frame(at) }
    })
  }, [history, telling])
  if (cuts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Change the state to see the change cut into pictures.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto">
        {cuts.map((cut) => (
          <div key={cut.at} className="flex flex-col items-center gap-1">
            <Still frame={cut.frame} telling={telling} />
            <span className="font-mono text-xs text-muted-foreground">
              {Math.round(
                (cut.at - (history.filter((played) => played.act === undefined).at(-1)?.at ?? 0)) *
                  1000,
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        The last change, in milliseconds from the moment it came.
      </p>
    </div>
  )
}

/** The face on its own, big, with what it is doing beside it and its last change under it. */
export function Stage({
  history,
  telling,
  size,
  magnify,
  ground,
  guides,
  state,
  onAct,
}: StageProps): ReactNode {
  const painter = useRef<FacePainter | null>(null)
  const lines = useGuides()
  const readout = useReadout()
  const playerAt = useMemo(() => playerOver(history, telling), [history, telling])
  useSprite((at) => {
    const frame = playerAt(at).frame(at)
    painter.current?.paint(frame)
    if (guides) lines.paint(frame, telling)
    readout.paint(frame, at)
  })
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-4">
        <div
          className={cn(
            'flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border',
            GROUNDS[ground],
          )}
        >
          <div className={MAGNIFY[magnify]}>
            <span className={cn('relative block', SIZE_CLASSES[size])}>
              <FaceFigure
                detail={detailFor(telling)}
                gain={telling.tuning.gain}
                painter={painter}
              />
              {guides && lines.view}
            </span>
          </div>
        </div>
        <div className="flex w-sidebar shrink-0 flex-col gap-6">
          <Acts state={state} onAct={onAct} />
          {readout.view}
        </div>
      </div>
      <Strip history={history} telling={telling} />
    </div>
  )
}
