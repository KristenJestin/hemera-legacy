import {
  FACE_SIZES,
  FACE_STATES,
  FaceFigure,
  type FacePainter,
  type FaceSize,
  type FaceState,
  SIZE_CLASSES,
  between,
  detailOf,
  dice,
  strand,
} from '@hemera/ui/face'
import { cn } from 'cn'
import { type ReactNode, useMemo, useRef } from 'react'

import { useSprite } from '../sprites.tsx'
import { type Played, type Telling, detailFor, playerOver } from '../story.ts'

/** How long a crowd's story lasts before it is told again from its start. */
const STORY = 120

/** How many faces the crowd has. */
const HEADS = 36

/** The states a crowd is put in, the busy ones more often: what a sidebar of Sessions looks like. */
const LIKELY: readonly FaceState[] = [
  ...FACE_STATES,
  'thinking',
  'reading',
  'writing',
  'running',
  'thinking',
  'writing',
  'done',
  'asleep',
]

/** The sizes a crowd's faces are drawn at: what sits beside the name of a Session. */
const SMALL: readonly FaceSize[] = FACE_SIZES.filter((size) => size !== 'lg' && size !== 'hero')

/** One face of the crowd, living its own story on the lab's clock. */
function Head({ index, telling }: { index: number; telling: Telling }): ReactNode {
  const painter = useRef<FacePainter | null>(null)
  const { playerAt, size } = useMemo(() => {
    const random = dice(strand(telling.seed, index + 100))
    const pick = (): FaceState => LIKELY[Math.floor(random() * LIKELY.length)]!
    const chosen = SMALL[Math.floor(random() * SMALL.length)]!
    const story: Played[] = [{ state: pick(), at: 0 }]
    for (let at = between(random(), 1, 4); at < STORY; at += between(random(), 1.5, 7)) {
      story.push({ state: pick(), at })
    }
    const told = { ...telling, seed: strand(telling.seed, index), detail: detailOf(chosen) }
    return { playerAt: playerOver(story, told), size: chosen }
  }, [index, telling])
  useSprite((at) => {
    const local = at % STORY
    painter.current?.paint(playerAt(local).frame(local))
  })
  return (
    <span className="flex size-12 items-center justify-center rounded-md border border-border">
      <span className={cn('block', SIZE_CLASSES[size])}>
        <FaceFigure
          detail={detailFor({ ...telling, detail: detailOf(size) })}
          gain={telling.tuning.gain}
          painter={painter}
        />
      </span>
    </span>
  )
}

/**
 * A crowd of small faces, each living a story of its own at the sizes a sidebar draws them: what
 * a column of Sessions would look like, and whether any of them falls into step with another.
 */
export function Crowd({ telling }: { telling: Telling }): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid w-fit grid-cols-9 gap-2">
        {Array.from({ length: HEADS }, (_, index) => (
          <Head key={index} index={index} telling={telling} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Every face lives its own story, told from its own seed, and changes state every few seconds.
      </p>
    </div>
  )
}
