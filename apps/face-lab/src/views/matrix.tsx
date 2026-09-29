import {
  FACE_STATES,
  FaceFigure,
  type FacePainter,
  type FaceState,
  changeBetween,
  createFace,
} from '@hemera/ui/face'
import { type ReactNode, useMemo, useRef } from 'react'

import { useSprite } from '../sprites.tsx'
import { type Telling, detailFor } from '../story.ts'

/** How long every cell holds the state it starts in, and how long a round of the grid lasts. */
const HOLD = 1.2
const ROUND = HOLD + 3.4

/** One change, played over and over on the lab's clock, every cell in step with the others. */
function Cell({
  from,
  to,
  telling,
}: {
  from: FaceState
  to: FaceState
  telling: Telling
}): ReactNode {
  const painter = useRef<FacePainter | null>(null)
  const player = useMemo(() => {
    const face = createFace({
      state: from,
      at: 0,
      seed: telling.seed,
      detail: detailFor(telling),
      reduced: telling.reduced,
      tuning: telling.tuning,
    })
    if (from !== to) face.change(to, HOLD)
    return face
  }, [from, to, telling])
  useSprite((at) => {
    painter.current?.paint(player.frame(((at % ROUND) + ROUND) % ROUND))
  })
  const said = from === to ? from : `${from} to ${to}: ${changeBetween(from, to)}`
  return (
    <span title={said} className="size-10 shrink-0">
      <FaceFigure detail={detailFor(telling)} gain={telling.tuning.gain} painter={painter} />
    </span>
  )
}

/**
 * Every change between two states, all at once and in step: the row is where the face comes
 * from, the column where it goes. Every number of the lab applies here too, so one setting can be
 * judged across every change it touches.
 */
export function Matrix({ telling }: { telling: Telling }): ReactNode {
  return (
    <div className="overflow-auto">
      <div className="grid w-fit grid-cols-13 gap-1 text-xs text-muted-foreground">
        <span />
        {FACE_STATES.map((to) => (
          <span key={to} className="truncate text-center">
            {to}
          </span>
        ))}
        {FACE_STATES.map((from) => (
          <div key={from} className="contents">
            <span className="flex items-center pr-2">{from}</span>
            {FACE_STATES.map((to) => (
              <span key={to} className="flex justify-center rounded-md p-1 hover:bg-muted">
                <Cell from={from} to={to} telling={telling} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Each cell holds its row's state, changes to its column's, and starts over, all on the lab's
        clock: slow it down to watch every change at once.
      </p>
    </div>
  )
}
