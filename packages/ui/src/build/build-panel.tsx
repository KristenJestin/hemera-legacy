import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { IconButton } from '../components/button/button.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconHammer } from '../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../motion.ts'
import { PanelDock } from '../session/session-row.tsx'
import type { SpecView } from '../spec/model.ts'
import { BuildSpecPanel } from './build-spec-panel.tsx'
import { type BuildViewProps, BuildView } from './build-view.tsx'
import { waitsOf } from './model.ts'

/**
 * The panel of a `build` Session (D10-12): the build beside the chat, in the Session's row, where a
 * `define` Session has its Spec — the same panel (#77): its frame, its widths, its swap with the
 * small frame it folds to at the window's edge (`session/panel-dock.tsx`).
 *
 * The Session's page is the one every Session has — its head and what goes on in it, the thread,
 * the composer and the notices on its edge — and the build is what stands on its right: the build
 * view, or the frozen Spec in its place while "Spec" is pressed. What waits for the user in the
 * build is among the Session's notices too, since that is where everything that waits for a human
 * is answered from.
 *
 * It opens unfolded. Folded, its small frame holds the unfold, the hammer, and a dot while
 * something in the build waits for the hand.
 */

/** The build view and the frozen Spec, which takes its place while it is open. */
const STAGE = 'relative flex min-h-0 min-w-0 flex-1 flex-col'

const OVER = 'absolute inset-0 flex flex-col'

/** The build view, and the same view kept drawn and hidden under the Spec. */
const VIEW = 'flex min-h-0 flex-1 flex-col'

const VIEW_UNDER = 'invisible flex min-h-0 flex-1 flex-col'

const TITLE = 'flex min-h-control-md items-center gap-2 text-sm font-medium'

/** The small frame, drawn as the Spec's is: its rim, the unfold on it, its body. */
const RIM = 'flex w-panel-frame flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const RIM_TOP = 'flex shrink-0 justify-end pt-1.5 pr-1.5 pb-1.5'

const RIM_BODY =
  'flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-body py-2 text-muted-foreground shadow-sm'

export interface BuildPanelProps extends Omit<BuildViewProps, 'specOpen' | 'onToggleSpec'> {
  /** The frozen revision the build works from, which "Spec" opens read only. */
  spec: SpecView
  /** Whether the panel starts folded to its small frame, which it does not unless told. */
  defaultFolded?: boolean | undefined
  /** Whether the frozen Spec is open in place of the view, for the story that shows it. */
  defaultSpecOpen?: boolean | undefined
}

export function BuildPanel({
  spec,
  defaultFolded = false,
  defaultSpecOpen = false,
  ...view
}: BuildPanelProps): ReactNode {
  const { build } = view
  const [folded, setFolded] = useState(defaultFolded)
  const [specOpen, setSpecOpen] = useState(defaultSpecOpen)
  const stage = useRef<HTMLDivElement>(null)
  const fade = useTransition(crossfade)
  const over = build.phase === 'accepted' || build.phase === 'stopped'
  const waits = !over && waitsOf(build)

  // Where the keyboard goes once the Spec opened or closed: its Close, or back to what opened it.
  const toSpec = useRef<'open' | 'close' | null>(null)

  function openSpec(): void {
    toSpec.current = 'open'
    setSpecOpen(true)
  }

  function closeSpec(): void {
    toSpec.current = 'close'
    setSpecOpen(false)
  }

  // Once the view is out of reach or back, the keyboard goes where the control it was on stands.
  useEffect(() => {
    const target = toSpec.current
    toSpec.current = null
    if (target === null) return
    const selector = target === 'open' ? '[aria-label="Close the Spec"]' : '[data-spec-toggle]'
    stage.current?.querySelector<HTMLElement>(selector)?.focus()
  }, [specOpen])

  return (
    <PanelDock
      label={`Build ${build.specKey}`}
      name="build"
      folded={folded}
      onFold={() => setFolded(true)}
      head={
        <h2 className={TITLE}>
          <IconHammer size="sm" aria-hidden="true" />
          Build
        </h2>
      }
      body={
        <div ref={stage} className={STAGE}>
          {/* The view stays drawn under the Spec, so what was unfolded in it is there when the
              Spec closes; it is out of reach while the Spec covers it. */}
          <div
            inert={specOpen}
            aria-hidden={specOpen ? true : undefined}
            className={specOpen ? VIEW_UNDER : VIEW}
          >
            <BuildView
              {...view}
              stories={spec.stories}
              specOpen={specOpen}
              onToggleSpec={() => (specOpen ? closeSpec() : openSpec())}
            />
          </div>
          <AnimatePresence initial={false}>
            {specOpen && (
              <motion.div
                key="spec"
                className={OVER}
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                exit={CROSSFADE.from}
                transition={fade}
              >
                <BuildSpecPanel spec={spec} onClose={closeSpec} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      }
      frame={<BuildFrame waits={waits} onUnfold={() => setFolded(false)} />}
    />
  )
}

/** The build folded: the unfold, the hammer, and the dot of what waits for the hand. */
function BuildFrame({ waits, onUnfold }: { waits: boolean; onUnfold: () => void }): ReactNode {
  return (
    <div className={RIM}>
      <div className={RIM_TOP}>
        <Tooltip label="Unfold the build" side="left">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronLeft size="sm" />}
            aria-label="Unfold the build"
            data-unfold
            onClick={onUnfold}
          />
        </Tooltip>
      </div>
      <div className={RIM_BODY}>
        <IconHammer size="md" aria-hidden="true" />
        {waits && <StatusDot status="running" label="Something in the build waits for you" />}
      </div>
    </div>
  )
}
