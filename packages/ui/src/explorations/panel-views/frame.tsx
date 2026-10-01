import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconHammer, IconX } from '../../icons.ts'
import { CROSSFADE, crossfade, fold, useTransition } from '../../motion.ts'
import { PanelDock } from '../../session/session-row.tsx'
import { type FrameState, type PanelView, type Variant, layView, overOf } from './model.ts'

/**
 * The Session's frame showing a base and the views opened on it (exploration of issue #333): the
 * dock of #324 as it is — its fold, its over-or-beside, its swap — with one head and one body for
 * whatever is shown.
 *
 * - **A, the stack**: the head is a breadcrumb from the base to the view on top, `Build ATL-7 ›
 *   Spec`, with a back that pops the top view and a close that goes back to the base. A crumb goes
 *   back down to where it names.
 * - **B, tabs**: the head is the base's tab and one tab per open view, each closable but the base.
 *
 * Both keep every open view drawn under the one shown, faded out and out of reach, and the base
 * under them all: going back finds its scroll and its folds where they were. The width is the shown
 * one's: a view that asks for room lays the frame over the chat as it opens, and going back to the
 * base gives the base the width it had.
 */

/** The head's line: as tall as a control, so the dock's own buttons stay where they stand. */
const LINE = 'flex min-h-control-md min-w-0 items-center gap-1'

const CRUMBS = 'flex min-w-0 items-center text-sm'

/** A crumb that goes back down to what it names. */
const CRUMB =
  'flex h-control-sm min-w-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring'

/** The crumb of what is shown: where the frame is, and nothing to press. */
const HERE = 'flex h-control-sm min-w-0 items-center gap-1.5 px-1.5 font-medium text-foreground'

const SEPARATOR = 'flex shrink-0 text-muted-foreground'

const ACTIONS = 'ml-auto flex shrink-0 items-center gap-1'

const STRIP = 'flex min-w-0 items-center gap-1'

/** A tab and its close, one place on the strip. */
const TAB = 'flex h-control-sm min-w-0 items-center rounded-md text-sm'

const TAB_SHOWN =
  'flex h-control-sm min-w-0 items-center rounded-md bg-surface-body text-sm shadow-sm'

const TAB_PRESS =
  'flex h-full min-w-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground outline-none hover:text-foreground focus-ring'

const TAB_PRESS_SHOWN =
  'flex h-full min-w-0 items-center gap-1.5 rounded-md px-2 font-medium text-foreground outline-none focus-ring'

/** A crumb or a tab arriving and leaving by its own width, pushing what stands after it. */
const SLOT = 'flex shrink-0 items-center overflow-hidden'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

const BODY = 'relative flex min-h-0 flex-1 flex-col'

const LAYER = 'absolute inset-0 flex flex-col'

/** The small frame the build folds to: its rim, the unfold on it, the hammer. */
const RIM = 'flex w-panel-frame flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const RIM_TOP = 'flex shrink-0 justify-end pt-1.5 pr-1.5 pb-1.5'

const RIM_BODY =
  'flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-body py-2 text-muted-foreground shadow-sm'

export interface PanelFrameProps {
  variant: Variant
  /** What the frame always holds under its views: the build. */
  base: PanelView
  /** The views open on it, by id, in the order they were opened. */
  views: ReadonlyMap<string, PanelView>
  state: FrameState
  onState: (next: FrameState) => void
  /** Shows the base, or a view already open: a crumb or a tab pressed. */
  onShow: (id: string | null) => void
  /** Closes a view, and whatever a stack had pushed over it. */
  onClose: (id: string) => void
}

export function PanelFrame({
  variant,
  base,
  views,
  state,
  onState,
  onShow,
  onClose,
}: PanelFrameProps): ReactNode {
  const [folded, setFolded] = useState(false)
  const shown = state.shown === null ? base : (views.get(state.shown) ?? base)
  const open = state.open.flatMap((one) => {
    const view = views.get(one.id)
    return view === undefined ? [] : [{ id: one.id, view }]
  })
  return (
    <PanelDock
      label={base.title}
      name="build"
      folded={folded}
      onFold={() => setFolded(true)}
      over={overOf(state)}
      onOver={(over) => onState(layView(state, over))}
      head={
        variant === 'stack' ? (
          <StackHead base={base} open={open} shown={shown} onShow={onShow} onClose={onClose} />
        ) : (
          <TabsHead
            base={base}
            open={open}
            shownId={state.shown}
            shown={shown}
            onShow={onShow}
            onClose={onClose}
          />
        )
      }
      body={
        <div className={BODY}>
          <AnimatePresence initial={false}>
            <Layer key="base" shown={state.shown === null}>
              {base.body}
            </Layer>
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {open.map((one) => (
              <Layer key={one.id} shown={state.shown === one.id}>
                {one.view.body}
              </Layer>
            ))}
          </AnimatePresence>
        </div>
      }
      frame={<BuildFrame onUnfold={() => setFolded(false)} />}
    />
  )
}

/** One view open on the base, as the head draws it. */
interface OpenView {
  id: string
  view: PanelView
}

/** A: the breadcrumb from the base to the view on top, its back and its close. */
function StackHead({
  base,
  open,
  shown,
  onShow,
  onClose,
}: {
  base: PanelView
  open: readonly OpenView[]
  shown: PanelView
  onShow: (id: string | null) => void
  onClose: (id: string) => void
}): ReactNode {
  const top = open.at(-1)
  return (
    <div className={LINE}>
      <AnimatePresence initial={false}>
        {top !== undefined && (
          <Slot key="back">
            <Tooltip label="Back">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronLeft size="sm" />}
                aria-label="Back"
                data-back
                onClick={() => onClose(top.id)}
              />
            </Tooltip>
          </Slot>
        )}
      </AnimatePresence>
      <nav aria-label="Where the frame is" className="min-w-0">
        <ol className={CRUMBS}>
          <li className="flex min-w-0">
            <Crumb view={base} here={top === undefined} onPress={() => onShow(null)} />
          </li>
          <AnimatePresence initial={false}>
            {open.map((one, index) => (
              <Slot key={one.id} as="li">
                <span className={SEPARATOR} aria-hidden="true">
                  <IconChevronRight size="sm" />
                </span>
                <Crumb
                  view={one.view}
                  here={index === open.length - 1}
                  onPress={() => onShow(one.id)}
                />
              </Slot>
            ))}
          </AnimatePresence>
        </ol>
      </nav>
      <span className={ACTIONS}>
        {shown.actions}
        {top !== undefined && (
          <Tooltip label={`Back to ${base.title}`}>
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconX size="sm" />}
              aria-label={`Back to ${base.title}`}
              onClick={() => onShow(null)}
            />
          </Tooltip>
        )}
      </span>
    </div>
  )
}

function Crumb({
  view,
  here,
  onPress,
}: {
  view: PanelView
  here: boolean
  onPress: () => void
}): ReactNode {
  if (here) {
    return (
      <h2 aria-current="page" className={HERE}>
        {view.icon}
        <span className="truncate">{view.title}</span>
      </h2>
    )
  }
  return (
    <button type="button" className={CRUMB} onClick={onPress}>
      {view.icon}
      <span className="truncate">{view.title}</span>
    </button>
  )
}

/**
 * B: the base's tab and one per open view, each closable but the base. Drawn as a navigation and
 * not a tab list: a tab list holds tabs alone, and each of these carries its close beside it.
 */
function TabsHead({
  base,
  open,
  shownId,
  shown,
  onShow,
  onClose,
}: {
  base: PanelView
  open: readonly OpenView[]
  shownId: string | null
  shown: PanelView
  onShow: (id: string | null) => void
  onClose: (id: string) => void
}): ReactNode {
  return (
    <div className={LINE}>
      <nav aria-label="Views of the frame" className={STRIP}>
        <Tab view={base} selected={shownId === null} onPress={() => onShow(null)} />
        <AnimatePresence initial={false}>
          {open.map((one) => (
            <Slot key={one.id}>
              <Tab
                view={one.view}
                selected={shownId === one.id}
                onPress={() => onShow(one.id)}
                onClose={() => onClose(one.id)}
              />
            </Slot>
          ))}
        </AnimatePresence>
      </nav>
      <span className={ACTIONS}>{shown.actions}</span>
    </div>
  )
}

function Tab({
  view,
  selected,
  onPress,
  onClose,
}: {
  view: PanelView
  selected: boolean
  onPress: () => void
  onClose?: () => void
}): ReactNode {
  return (
    <span className={selected ? TAB_SHOWN : TAB}>
      <button
        type="button"
        aria-current={selected ? 'page' : undefined}
        className={selected ? TAB_PRESS_SHOWN : TAB_PRESS}
        onClick={onPress}
      >
        {view.icon}
        <span className="truncate">{view.title}</span>
      </button>
      {onClose !== undefined && (
        <Tooltip label={`Close ${view.title}`}>
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconX size="sm" />}
            aria-label={`Close ${view.title}`}
            onClick={onClose}
          />
        </Tooltip>
      )}
    </span>
  )
}

/** A place of the head that arrives and leaves by its own width. */
function Slot({ as = 'span', children }: { as?: 'span' | 'li'; children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  const Element = as === 'li' ? motion.li : motion.span
  return (
    <Element
      className={SLOT}
      initial={HIDDEN}
      animate={SHOWN}
      exit={HIDDEN}
      transition={transition}
    >
      {children}
    </Element>
  )
}

/**
 * One of what the body holds, the base or a view: all stay drawn, the one not shown cross-faded out
 * and out of reach, so going back keeps what was unfolded and scrolled in each. A view opened comes
 * up from transparent in place, and one closed fades out where it stood.
 */
function Layer({ shown, children }: { shown: boolean; children: ReactNode }): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <motion.div
      className={LAYER}
      inert={!shown}
      aria-hidden={shown ? undefined : true}
      initial={CROSSFADE.from}
      animate={shown ? CROSSFADE.to : CROSSFADE.from}
      exit={CROSSFADE.from}
      transition={fade}
    >
      {children}
    </motion.div>
  )
}

/** The build folded: the unfold and the hammer. */
function BuildFrame({ onUnfold }: { onUnfold: () => void }): ReactNode {
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
      </div>
    </div>
  )
}
