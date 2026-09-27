import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Frame, FrameHeader } from '../../components/frame/frame.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronDown, IconFileText, IconFolderOpen } from '../../icons.ts'
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
 * Variant B · Strip (issue #219): the Session's own strip, under its title, and the area on the right
 * left to the mission alone.
 *
 * One line under the head says, in words, what the Session works with: its Workspace and how it
 * stands, how many commands run, how many services are up, how far the plan is, and what the agent
 * works from. It is read without a press. A press unfolds that place in a sheet right under the
 * strip, on the column the thread is on, which pushes the thread down rather than covering it; the
 * Spec or the build keeps its panel on the right and never shares it. The same press, the sheet's
 * chevron or Escape folds it back, and the keyboard goes back to the strip.
 *
 * The ⓘ dialog is kept for what is rarely needed: the trace, and the Workspace's folder on disk.
 */

const STRIP = 'flex min-w-0 flex-wrap items-center gap-1'

const WORDS = 'min-w-0 truncate'

/** The sheet's body: as tall as what it holds, up to the share of the window a pinned block has. */
const SHEET_BODY = 'max-h-pinned overflow-y-auto rounded-lg p-3 outline-none focus-ring'

export interface StripSessionProps {
  mission: Mission
  facts: SessionFacts
  spec?: SpecView | undefined
  /** Whether the Spec starts folded to its small frame. */
  specFolded?: boolean | undefined
  /** The place unfolded under the strip as the Session opens, or none. */
  defaultPlace?: Place | null | undefined
  /** Whether the ⓘ dialog starts open, for the story that shows what it keeps. */
  defaultDetailsOpen?: boolean | undefined
  actions: PlaceActions
}

export function StripSession({
  mission,
  facts,
  spec,
  specFolded = true,
  defaultPlace = null,
  defaultDetailsOpen = false,
  actions,
}: StripSessionProps): ReactNode {
  const [place, setPlace] = useState<Place | null>(defaultPlace)
  const [details, setDetails] = useState(defaultDetailsOpen)
  const strip = useRef<HTMLDivElement>(null)
  const transition = useTransition(morph)

  /** Folds the sheet, and hands the keyboard back to the strip's control of the place it showed. */
  function fold(): void {
    const shown = place
    setPlace(null)
    if (shown !== null)
      strip.current?.querySelector<HTMLElement>(`[data-place="${shown}"]`)?.focus()
  }

  // Escape folds the sheet from the strip or from inside the sheet alike.
  const under = (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && place !== null) fold()
      }}
    >
      <div ref={strip} role="group" aria-label="What this Session works with" className={STRIP}>
        {PLACES.map((one) => {
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
              aria-controls="session-sheet"
              aria-label={`${PLACE_WORDS[one]}: ${glance.words}`}
              onClick={() => (shown ? fold() : setPlace(one))}
            >
              {PLACE_ICONS[one]}
              {glance.tone !== null && <StatusDot status={glance.tone} size="sm" />}
              <span className={WORDS}>{glance.words}</span>
            </Button>
          )
        })}
      </div>
      <AnimatePresence initial={false}>
        {place !== null && (
          <motion.div
            key="sheet"
            id="session-sheet"
            className="overflow-hidden"
            initial={collapse}
            animate={expand}
            exit={collapse}
            transition={transition}
          >
            <Frame
              header={
                <FrameHeader
                  icon={PLACE_ICONS[place]}
                  title={PLACE_WORDS[place]}
                  action={
                    <Tooltip label="Fold" keys="Esc">
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon={<IconChevronDown size="sm" />}
                        aria-label={`Fold ${PLACE_WORDS[place]}`}
                        onClick={fold}
                      />
                    </Tooltip>
                  }
                />
              }
            >
              <div
                className={SHEET_BODY}
                tabIndex={0}
                role="region"
                aria-label={PLACE_WORDS[place]}
              >
                <Crossfaded key={place}>
                  <PlacePart
                    place={place}
                    facts={facts}
                    actions={{ ...actions, onOpenTrace: undefined }}
                  />
                </Crossfaded>
              </div>
            </Frame>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Conversation
        mission={mission}
        workspace={facts.workspace?.name}
        onOpenDetails={() => setDetails(true)}
        under={under}
      />
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
      <Dialog
        title="Session details"
        description="What is rarely needed: the record of what the agent and Hemera said, and where the Workspace is on disk."
        open={details}
        onOpenChange={setDetails}
      >
        <div className="flex flex-col gap-3">
          {facts.workspace !== null && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Workspace folder</span>
              <span className="font-mono text-xs break-all">{facts.workspace.folder}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={actions.onOpenTrace}>
              <IconFileText size="sm" aria-hidden="true" />
              Open the trace
            </Button>
            {facts.workspace !== null && (
              <Button variant="secondary" size="sm" onClick={actions.onOpenFolder}>
                <IconFolderOpen size="sm" aria-hidden="true" />
                Open the folder
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
