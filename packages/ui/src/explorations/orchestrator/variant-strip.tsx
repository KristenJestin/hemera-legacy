import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Face } from '../../components/face/face.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconMessage } from '../../icons.ts'
import { CROSSFADE, crossfade, instant, morph, useTransition } from '../../motion.ts'
import { Head, MainChat, Stage, type VariantProps, useBuild, useHelpers } from './page.tsx'

/**
 * A · Strip. The chat and the build side by side; the chat folds to a strip on the left, and the
 * build takes the width.
 *
 * Folded, the strip keeps the main agent's live face — what it is doing, at a glance, its last line
 * under the pointer — the way back, and a Write that unfolds the chat with the caret in its box.
 * The notices leave the composer's edge for the foot of the stage once the fold has landed, and
 * rise there as they rise from the composer: they are never drawn twice, nor carried across.
 * The line of what goes on is in the head across the page, whatever the chat does.
 *
 * The width is what moves, on `morph`, pushing the build; what the chat holds is laid at its
 * unfolded width the whole way and clipped, so its text never reflows. The build's does, once, as
 * its column grows. The slot is the build panel's own (`build-slot`, band to share): in the design
 * system it would be a `chat-slot` of its own.
 */

const ROW = '@container relative flex min-h-0 flex-1'

const SLOT = 'build-slot relative min-h-0 shrink-0 overflow-hidden border-r border-border'

const OPEN = 'absolute inset-y-0 left-0 flex w-build-panel flex-col bg-background'

const BAND =
  'absolute inset-y-0 left-0 z-10 flex w-build-band flex-col items-center gap-3 bg-background pt-2'

const FACE = 'flex rounded-md p-1 outline-none hover:bg-accent focus-ring'

const FOOT = 'pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center'

export function StripSession(props: VariantProps): ReactNode {
  const { helpers, open, setOpen, helper } = useHelpers(props)
  const { view, notices } = useBuild()
  const [folded, setFolded] = useState(!props.chatOpen)
  const [moving, setMoving] = useState(false)
  const [focus, setFocus] = useState(false)
  const slot = useRef<HTMLElement>(null)
  const width = useTransition(morph)
  const fade = useTransition(crossfade)
  const share = useMotionValue(props.chatOpen ? 1 : 0)

  function fold(next: boolean): void {
    if (folded === next) return
    setFolded(next)
    setMoving(true)
  }

  function pose(value: number): void {
    slot.current?.style.setProperty('--build-open', String(value))
  }

  useLayoutEffect(() => {
    pose(share.get())
  }, [])

  useLayoutEffect(() => {
    const target = folded ? 0 : 1
    if (share.get() === target) return
    if (width === instant) {
      share.jump(target)
      pose(target)
      setMoving(false)
      return
    }
    let live = true
    const travel = animate(share, target, { ...width, onUpdate: pose })
    void travel.then(() => {
      if (live) setMoving(false)
    })
    return () => {
      live = false
      travel.stop()
    }
  }, [folded])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Head
        helpers={helpers}
        openHelper={open}
        onOpenHelper={setOpen}
        glance={props.glance}
        start={
          <Tooltip label={folded ? 'Unfold the chat' : 'Fold the chat'}>
            <IconButton
              variant="ghost"
              size="sm"
              icon={folded ? <IconChevronRight size="sm" /> : <IconChevronLeft size="sm" />}
              aria-label={folded ? 'Unfold the chat' : 'Fold the chat'}
              aria-expanded={!folded}
              onClick={() => fold(!folded)}
            />
          </Tooltip>
        }
      />
      <div className={ROW}>
        <section ref={slot} aria-label="Chat with the main agent" className={SLOT}>
          {(!folded || moving) && (
            <div inert={folded} aria-hidden={folded ? true : undefined} className={OPEN}>
              <MainChat notices={notices} focus={focus} onFocusTaken={() => setFocus(false)} />
            </div>
          )}
          <AnimatePresence initial={false}>
            {folded && (
              <motion.div
                key="band"
                className={BAND}
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                exit={CROSSFADE.from}
                transition={fade}
              >
                <Tooltip
                  label="T2 is on its header again; T3 has not reported since 10:33."
                  side="right"
                >
                  <button
                    type="button"
                    className={FACE}
                    aria-label="The main agent, thinking"
                    onClick={() => fold(false)}
                  >
                    <Face state="thinking" size="sm" seed={3} />
                  </button>
                </Tooltip>
                <Tooltip label="Write to the main agent" side="right">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconMessage size="sm" />}
                    aria-label="Write to the main agent"
                    onClick={() => {
                      setFocus(true)
                      fold(false)
                    }}
                  />
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Stage view={view} helper={helper} helpers={helpers} onBack={() => setOpen(null)} />
          <AnimatePresence initial={false}>
            {folded && !moving && (
              <motion.div
                key="notices"
                className={FOOT}
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                exit={CROSSFADE.from}
                transition={fade}
              >
                {notices}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
