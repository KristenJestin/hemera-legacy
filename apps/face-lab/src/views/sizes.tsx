import {
  FACE_SIZES,
  FaceFigure,
  type FacePainter,
  type FaceSize,
  SIZE_CLASSES,
  detailOf,
} from '@hemera/ui/face'
import { cn } from 'cn'
import { type ReactNode, useMemo, useRef } from 'react'

import { useSprite } from '../sprites.tsx'
import { type Played, type Telling, detailFor, playerOver } from '../story.ts'

/** The story of the stage, told at one size, with what that size can hold. */
function AtSize({
  size,
  history,
  telling,
}: {
  size: FaceSize
  history: readonly Played[]
  telling: Telling
}): ReactNode {
  const painter = useRef<FacePainter | null>(null)
  const playerAt = useMemo(
    () => playerOver(history, { ...telling, detail: detailOf(size) }),
    [history, telling, size],
  )
  useSprite((at) => {
    painter.current?.paint(playerAt(at).frame(at))
  })
  return (
    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <span className={cn('block', SIZE_CLASSES[size])}>
        <FaceFigure
          detail={detailFor({ ...telling, detail: detailOf(size) })}
          gain={telling.tuning.gain}
          painter={painter}
        />
      </span>
      <span>{size}</span>
      <span>{detailOf(size)}</span>
    </div>
  )
}

/**
 * The face of the stage at every size at once, each drawn with what its size can hold: an icon
 * with no mouth and heavier strokes, a hero with everything.
 */
export function Sizes({
  history,
  telling,
}: {
  history: readonly Played[]
  telling: Telling
}): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-10">
        {FACE_SIZES.map((size) => (
          <AtSize key={size} size={size} history={history} telling={telling} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        The same story as the stage, at the sizes the application draws the face at.
      </p>
    </div>
  )
}
