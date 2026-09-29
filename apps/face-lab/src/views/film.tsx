import { Select } from '@hemera/ui'
import { EXPRESSIONS, FACE_STATES, type FaceState, changeBetween } from '@hemera/ui/face'
import { type ReactNode, useMemo, useState } from 'react'

import { Choice } from '../controls.tsx'
import { type Telling, lengthOf, replay } from '../story.ts'
import { Still } from './stage.tsx'

/** How many pictures each strip is cut into. */
const CUTS = 16

/** When the change comes in each strip, on the clock of its own story. */
const AT = 1.5

/** How long of a state's life a strip shows, to choose from, in seconds. */
const SPANS = [2, 4, 8, 16] as const

type Span = (typeof SPANS)[number]

const STATE_ITEMS = FACE_STATES.map((state) => ({ value: state, label: EXPRESSIONS[state].label }))

/** Pictures of one story, from `start` over `span` seconds, at even moments. */
function Cuts({
  story,
  start,
  span,
  telling,
}: {
  story: readonly { readonly state: FaceState; readonly at: number }[]
  start: number
  span: number
  telling: Telling
}): ReactNode {
  const cuts = useMemo(() => {
    const player = replay(story, telling)
    return Array.from({ length: CUTS }, (_, index) => {
      const at = start + (span * index) / (CUTS - 1)
      return { at, frame: player.frame(at) }
    })
  }, [story, start, span, telling])
  return (
    <>
      {cuts.map((cut) => (
        <Still key={cut.at} frame={cut.frame} telling={telling} />
      ))}
    </>
  )
}

/** A row of pictures under its name. */
function Row({
  name,
  note,
  children,
}: {
  name: string
  note: string
  children: ReactNode
}): ReactNode {
  return (
    <div className="flex items-center gap-1">
      <span className="flex w-24 shrink-0 flex-col text-xs">
        <span>{name}</span>
        <span className="text-muted-foreground">{note}</span>
      </span>
      {children}
    </div>
  )
}

/** Every change out of one state, from just before it comes to just after it lands. */
function Changes({ from, telling }: { from: FaceState; telling: Telling }): ReactNode {
  return (
    <>
      {FACE_STATES.filter((to) => to !== from).map((to) => (
        <Row key={to} name={to} note={changeBetween(from, to)}>
          <Cuts
            story={[
              { state: from, at: 0 },
              { state: to, at: AT },
            ]}
            start={AT - 0.1}
            span={lengthOf(from, to, telling.tuning) + 0.3}
            telling={telling}
          />
        </Row>
      ))}
      <p className="text-xs text-muted-foreground">
        From a tenth of a second before the change to a third of a second after it lands, at even
        moments.
      </p>
    </>
  )
}

/** Every state living on its own for a while: its gestures, its blinks, its flourishes. */
function Lives({ span, telling }: { span: Span; telling: Telling }): ReactNode {
  return (
    <>
      {FACE_STATES.map((state) => (
        <Row key={state} name={state} note={EXPRESSIONS[state].motion}>
          <Cuts story={[{ state, at: 0 }]} start={1} span={span} telling={telling} />
        </Row>
      ))}
      <p className="text-xs text-muted-foreground">
        {`${String(span)} seconds of each state's life, a second after it began, at even moments.`}
      </p>
    </>
  )
}

/**
 * The face frame by frame: every change out of one state, or every state living on its own. The
 * way an animator lays a move out to judge it, and the way each pair of states is reviewed without
 * having to catch it in motion.
 */
export function Film({
  telling,
  start,
  lives,
}: {
  telling: Telling
  start: FaceState
  lives: boolean
}): ReactNode {
  const [from, setFrom] = useState<FaceState>(start)
  const [showing, setShowing] = useState<'changes' | 'lives'>(lives ? 'lives' : 'changes')
  const [span, setSpan] = useState<Span>(4)
  return (
    <div className="flex flex-col gap-3 overflow-auto">
      <div className="flex items-end gap-4">
        <Choice
          label="Show"
          options={['changes', 'lives'] as const}
          value={showing}
          name={(what) => (what === 'changes' ? 'Every change out of' : 'Every state living')}
          onChange={setShowing}
        />
        {showing === 'changes' ? (
          <div className="w-sidebar">
            <Select label="From" items={STATE_ITEMS} value={from} onValueChange={setFrom} />
          </div>
        ) : (
          <Choice
            label="For"
            options={SPANS}
            value={span}
            name={(seconds) => `${String(seconds)} s`}
            onChange={setSpan}
          />
        )}
      </div>
      {showing === 'changes' ? (
        <Changes from={from} telling={telling} />
      ) : (
        <Lives span={span} telling={telling} />
      )}
    </div>
  )
}
