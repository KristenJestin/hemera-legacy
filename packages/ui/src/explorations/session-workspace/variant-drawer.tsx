import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tabs } from '../../components/tabs/tabs.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronDown } from '../../icons.ts'
import { collapse, expand, morph, useTransition } from '../../motion.ts'
import type { SpecView } from '../../spec/model.ts'
import { SpecPanel } from '../../spec/spec-panel.tsx'
import { type Mission, PLACES, PLACE_WORDS, type Place, type SessionFacts } from './fixtures.ts'
import {
  BuildPanel,
  Conversation,
  Crossfaded,
  PLACE_ICONS,
  type PlaceActions,
  PlacePart,
  glanceOf,
} from './parts.tsx'

/**
 * Variant C · Drawer (issue #219): a drawer under the whole Session, as a terminal is under an
 * editor.
 *
 * Its bar is always there, across the bottom of the Session under the chat and its panel alike,
 * and says what the Session works with in a line: the Workspace and how it stands, what runs, what
 * is up, then the plan and the context at its end. A press on any of them opens the drawer on it,
 * upwards, pushing the chat and the panel up rather than covering them; `Ctrl+J` opens and closes
 * it from anywhere, as it does in an editor. Inside, the places are tabs, and a command's output
 * has the whole width of the window to be read in. The same press, the chevron or Escape closes it,
 * and the keyboard goes back to the bar.
 *
 * The ⓘ dialog is removed: Activity and Context are tabs of the drawer, the trace at the foot of
 * Activity.
 */

const BAR =
  'flex h-control-lg shrink-0 items-center gap-1 border-t border-border bg-surface-rim px-3'

const WORDS = 'min-w-0 truncate'

/** The drawer, the share of the window a pinned block may take, whose chosen tab scrolls inside it. */
const DRAWER = 'flex h-pinned flex-col border-t border-border bg-surface-body'

const TABS =
  'flex min-h-0 flex-1 flex-col mx-4 mt-1 *:last:min-h-0 *:last:flex-1 *:last:flex *:last:flex-col'

const SCROLL = 'min-h-0 flex-1 overflow-y-auto rounded-md pb-4 outline-none focus-ring'

/** The places at the bar's start, and the ones at its end. */
const LEADING: readonly Place[] = ['workspace', 'commands', 'services']

const TRAILING: readonly Place[] = ['activity', 'context']

export interface DrawerSessionProps {
  mission: Mission
  facts: SessionFacts
  spec?: SpecView | undefined
  specFolded?: boolean | undefined
  /** The place the drawer is open on as the Session opens, or none. */
  defaultPlace?: Place | null | undefined
  actions: PlaceActions
}

export function DrawerSession({
  mission,
  facts,
  spec,
  specFolded = true,
  defaultPlace = null,
  actions,
}: DrawerSessionProps): ReactNode {
  const [place, setPlace] = useState<Place | null>(defaultPlace)
  // The tab the drawer shows, kept while it is closed: `Ctrl+J` opens it where it was left.
  const [last, setLast] = useState<Place>(defaultPlace ?? 'commands')
  const bar = useRef<HTMLDivElement>(null)
  const transition = useTransition(morph)

  function open(on: Place): void {
    setPlace(on)
    setLast(on)
  }

  /** Closes the drawer, and hands the keyboard back to the bar's control of what it showed. */
  function close(): void {
    const shown = place
    setPlace(null)
    if (shown !== null) bar.current?.querySelector<HTMLElement>(`[data-place="${shown}"]`)?.focus()
  }

  // `Ctrl+J` from anywhere in the Session: open where it was left, or close.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.key.toLowerCase() !== 'j') return
      event.preventDefault()
      if (place === null) {
        open(last)
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`[data-drawer] [data-mark="${last}"]`)?.focus()
        })
      } else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function entry(one: Place): ReactNode {
    const glance = glanceOf(one, facts)
    const shown = place === one
    return (
      <Button
        key={one}
        variant={shown ? 'secondary' : 'ghost'}
        size="sm"
        className="min-w-0"
        data-place={one}
        aria-expanded={shown}
        aria-label={`${PLACE_WORDS[one]}: ${glance.words}`}
        onClick={() => (shown ? close() : open(one))}
      >
        {PLACE_ICONS[one]}
        {glance.tone !== null && <StatusDot status={glance.tone} size="sm" />}
        <span className={WORDS}>{glance.words}</span>
      </Button>
    )
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <div className="@container flex min-h-0 flex-1">
        <Conversation mission={mission} workspace={facts.workspace?.name} />
        {mission === 'define' && spec !== undefined && (
          <SpecPanel
            spec={spec}
            defaultFolded={specFolded}
            onMarkReady={() => undefined}
            onRework={() => undefined}
            onPickRevision={() => undefined}
            onTakeOver={() => undefined}
          />
        )}
        {mission === 'build' && <BuildPanel />}
      </div>
      {/* Escape closes the drawer from its bar or from inside it alike. */}
      <div
        className="flex shrink-0 flex-col"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && place !== null) close()
        }}
      >
        <AnimatePresence initial={false}>
          {place !== null && (
            <motion.div
              key="drawer"
              className="shrink-0 overflow-hidden"
              initial={collapse}
              animate={expand}
              exit={collapse}
              transition={transition}
            >
              <section aria-label="What this Session works with" data-drawer className={DRAWER}>
                <Tabs
                  label="What this Session works with"
                  value={place}
                  onValueChange={open}
                  className={TABS}
                  items={PLACES.map((one) => ({
                    value: one,
                    label: PLACE_WORDS[one],
                    icon: PLACE_ICONS[one],
                    panel: (
                      <Crossfaded fill>
                        <div className={SCROLL} tabIndex={0}>
                          {/* Commands take the width for their output; the rest keeps a line's. */}
                          <div
                            className={
                              one === 'commands' ? 'flex flex-col' : 'flex max-w-3xl flex-col'
                            }
                          >
                            <PlacePart place={one} facts={facts} actions={actions} wide />
                          </div>
                        </div>
                      </Crossfaded>
                    ),
                  }))}
                />
              </section>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bar} role="group" aria-label="This Session's bar" className={BAR}>
          {LEADING.map(entry)}
          <span className="flex-1" />
          {TRAILING.map(entry)}
          <Tooltip label={place === null ? 'Open the drawer' : 'Close the drawer'} keys="Ctrl+J">
            <IconButton
              variant="ghost"
              size="sm"
              icon={
                <span className={place === null ? 'flex rotate-180' : 'flex'}>
                  <IconChevronDown size="sm" />
                </span>
              }
              aria-label={place === null ? 'Open the drawer' : 'Close the drawer'}
              aria-expanded={place !== null}
              data-drawer-toggle
              onClick={() => (place === null ? open(last) : close())}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
