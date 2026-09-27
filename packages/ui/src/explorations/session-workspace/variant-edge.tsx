import { animate, motion, useMotionValue } from 'motion/react'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tabs, type TabsItem } from '../../components/tabs/tabs.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconHammer, IconListDetails } from '../../icons.ts'
import { CROSSFADE, instant, onTheBeat, slide, swap, useTransition } from '../../motion.ts'
import { PHASE_TITLES, type PhaseName, type SpecView } from '../../spec/model.ts'
import { PhaseGlyph } from '../../spec/phase-glyph.tsx'
import { SpecColumn } from '../../spec/spec-column.tsx'
import { SpecHead } from '../../spec/spec-head.tsx'
import { PROGRESS_WORDS, phaseProgressOf, phasesOf } from '../../spec/spec-phases.ts'
import { type Mission, PLACES, PLACE_WORDS, type Place, type SessionFacts } from './fixtures.ts'
import {
  BuildTasks,
  Conversation,
  Crossfaded,
  PLACE_ICONS,
  type PlaceActions,
  PlacePart,
  glanceOf,
} from './parts.tsx'

/**
 * Variant A · Edge (issue #219): one area on the right, and everything a Session works with is a tab
 * of it.
 *
 * The small frame at the window's edge the Spec folds to since #164 grows a second body under the
 * mission's: the Session's own five glyphs — Workspace, Commands, Services, Activity, Context —
 * each with the dot of how it stands. A free Session, which had nothing at its edge, gets that
 * frame alone. A glyph unfolds the one panel on its tab, by the same swap the Spec has, pushing the
 * chat; the mission is the first tab of that panel (the Spec, or the build), so there is never a
 * second panel beside it, and a Spec open and a Workspace open are the same panel on two tabs.
 * Folding, from the chevron or with Escape, brings the small frame back and the keyboard to the
 * glyph it left from.
 *
 * The ⓘ dialog is removed: its three tabs are tabs here, and the trace is at the foot of Activity.
 */

/** The panel's tabs: the mission's first, then the Session's own. */
export type EdgeTab = 'mission' | Place

/** The dock at the window's edge, the same geometry as the Spec's (`spec-slot`, `spec-panel-in`). */
const DOCK = 'relative flex h-full min-h-0 shrink-0 overflow-x-clip py-3 pr-3'

const CLIP =
  'pointer-events-none absolute inset-y-3 right-0 box-content w-spec-panel overflow-hidden pr-3'

const PANEL =
  'spec-panel-in pointer-events-auto flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const STOWED =
  'spec-panel-in pointer-events-auto invisible flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const FRAME_PLACE = 'pointer-events-none absolute inset-y-3 right-3 z-1 flex items-start'

const RIM =
  'flex w-spec-frame flex-col gap-1.5 rounded-xl border border-border bg-surface-rim p-1.5'

const TOP = 'flex shrink-0 justify-end pt-1.5 pr-1.5'

const BODY = 'flex flex-col gap-1 rounded-lg border border-border bg-surface-body p-1 shadow-sm'

const GLYPH =
  'relative flex size-control-md items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring'

/** The dot on a glyph's corner: how the place stands, read from the corner of the eye. */
const CORNER = 'pointer-events-none absolute top-1 right-1 flex'

const HEAD = 'flex shrink-0 items-center gap-2 pt-1 pr-1.5 pb-2.5 pl-2.5'

const HEAD_TITLE = 'min-w-0 flex-1 truncate text-sm font-medium'

/** The body: the tabs and what they show, scrolling inside it. */
const PANEL_BODY =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/** The tabs fill the body; the chosen tab's own content scrolls. */
const TABS =
  'flex min-h-0 flex-1 flex-col mx-3 mt-2 *:last:min-h-0 *:last:flex-1 *:last:flex *:last:flex-col'

const SCROLL = 'min-h-0 flex-1 overflow-y-auto rounded-md pb-3 outline-none focus-ring'

export interface EdgeSessionProps {
  mission: Mission
  facts: SessionFacts
  /** The Spec of a `define` Session. */
  spec?: SpecView | undefined
  /** Whether the panel opens unfolded, and on which tab. */
  defaultTab?: EdgeTab | null | undefined
  actions: PlaceActions
}

export function EdgeSession({
  mission,
  facts,
  spec,
  defaultTab = null,
  actions,
}: EdgeSessionProps): ReactNode {
  return (
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Conversation mission={mission} workspace={facts.workspace?.name} />
      <EdgeDock
        mission={mission}
        facts={facts}
        spec={spec}
        defaultTab={defaultTab}
        actions={actions}
      />
    </div>
  )
}

function EdgeDock({
  mission,
  facts,
  spec,
  defaultTab,
  actions,
}: Required<Pick<EdgeSessionProps, 'mission' | 'facts' | 'actions'>> & {
  spec: SpecView | undefined
  defaultTab: EdgeTab | null
}): ReactNode {
  const hasMission = mission !== 'free'
  const [tab, setTab] = useState<EdgeTab>(defaultTab ?? (hasMission ? 'mission' : 'workspace'))
  const [folded, setFolded] = useState(defaultTab === null)
  const [moving, setMoving] = useState(false)
  const dock = useRef<HTMLElement>(null)
  // The glyph the panel was opened from, which the keyboard goes back to when it folds.
  const from = useRef<string | null>(null)
  const move = useTransition(swap.move)
  const fade = useTransition(swap.fade)
  const still = move === instant
  const open = useMotionValue(folded ? 0 : 1)
  const groups = useMemo(() => (spec === undefined ? [] : phasesOf(spec)), [spec])
  const column = useRef<HTMLDivElement>(null)

  /** Writes how far open the panel is, which its slot's width and its place are drawn from. */
  function pose(share: number): void {
    dock.current?.style.setProperty('--spec-open', String(share))
  }

  useLayoutEffect(() => {
    pose(open.get())
  }, [])

  useLayoutEffect(() => {
    const target = folded ? 0 : 1
    const start = open.get()
    if (start === target) return
    if (still) {
      open.jump(target)
      pose(target)
      setMoving(false)
      return
    }
    const late = !folded && start === 0 ? onTheBeat(move) : move
    let live = true
    const travel = animate(open, target, { ...late, onUpdate: pose })
    void travel.then(() => {
      if (live) setMoving(false)
    })
    return () => {
      live = false
      travel.stop()
    }
  }, [folded])

  function unfold(on: EdgeTab, glyph: string): void {
    from.current = glyph
    setTab(on)
    setFolded(false)
    setMoving(true)
    // The keyboard goes to the tab the panel opened on, once it is there.
    requestAnimationFrame(() => {
      dock.current
        ?.querySelector<HTMLElement>(`[data-mark="${on}"]`)
        ?.focus({ preventScroll: true })
    })
  }

  function fold(): void {
    setFolded(true)
    setMoving(true)
    const back = from.current ?? '[data-unfold]'
    requestAnimationFrame(() => {
      dock.current?.querySelector<HTMLElement>(back)?.focus({ preventScroll: true })
    })
  }

  const missionTab: TabsItem<EdgeTab>[] =
    mission === 'define' && spec !== undefined
      ? [
          {
            value: 'mission',
            label: 'Spec',
            icon: <IconListDetails size="sm" />,
            panel: (
              <Crossfaded fill>
                <div className="flex shrink-0 flex-col pb-2">
                  <SpecHead
                    specKey={spec.key}
                    title={spec.title}
                    type={spec.type}
                    status={spec.status}
                    revision={spec.revision}
                    revisions={spec.revisions}
                    onPickRevision={() => undefined}
                    onRework={() => undefined}
                  />
                </div>
                <SpecColumn spec={spec} groups={groups} column={column} still={still} />
              </Crossfaded>
            ),
          },
        ]
      : mission === 'build'
        ? [
            {
              value: 'mission',
              label: 'Build',
              icon: <IconHammer size="sm" />,
              panel: (
                <Crossfaded fill>
                  <div className={SCROLL} tabIndex={0}>
                    <BuildTasks />
                  </div>
                </Crossfaded>
              ),
            },
          ]
        : []

  const items: TabsItem<EdgeTab>[] = [
    ...missionTab,
    ...PLACES.map((place) => ({
      value: place,
      label: PLACE_WORDS[place],
      icon: PLACE_ICONS[place],
      panel: (
        <Crossfaded fill>
          <div className={SCROLL} tabIndex={0}>
            <PlacePart place={place} facts={facts} actions={actions} />
          </div>
        </Crossfaded>
      ),
    })),
  ]

  const away = slide('stage').enter
  const frameMoves = folded ? onTheBeat(fade) : fade

  return (
    <section ref={dock} aria-label="What this Session works with" className={DOCK}>
      <div aria-hidden="true" className="spec-slot shrink-0" />
      <div className={CLIP}>
        <div
          inert={folded}
          aria-hidden={folded ? true : undefined}
          className={folded && !moving ? STOWED : PANEL}
          onKeyDown={(event) => {
            if (event.key === 'Escape') fold()
          }}
        >
          <header className={HEAD}>
            <span className={HEAD_TITLE}>
              {mission === 'define' && spec !== undefined
                ? `Spec ${spec.key} and this Session`
                : mission === 'build'
                  ? 'Build ATL-7 and this Session'
                  : 'This Session'}
            </span>
            <Tooltip label="Fold the panel" keys="Esc" side="left">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronRight size="sm" />}
                aria-label="Fold the panel"
                onClick={fold}
              />
            </Tooltip>
          </header>
          <div className={PANEL_BODY}>
            <Tabs
              label="What this Session works with"
              items={items}
              value={tab}
              onValueChange={setTab}
              className={TABS}
            />
          </div>
        </div>
      </div>
      <motion.div
        inert={!folded}
        aria-hidden={folded ? undefined : true}
        className={FRAME_PLACE}
        initial={false}
        animate={folded ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
        transition={frameMoves}
      >
        <div className="pointer-events-auto">
          <div className={RIM}>
            <div className={TOP}>
              <Tooltip label="Unfold the panel" side="left">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronLeft size="sm" />}
                  aria-label="Unfold the panel"
                  data-unfold
                  onClick={() => unfold(tab, '[data-unfold]')}
                />
              </Tooltip>
            </div>
            {mission === 'define' && spec !== undefined && (
              <nav aria-label={`Phases of ${spec.key}`} className={BODY}>
                {groups.map((group) => {
                  const progress = phaseProgressOf(group, spec.focus)
                  const words = `${PHASE_TITLES[group.phase]} · ${PROGRESS_WORDS[progress]}`
                  return (
                    <Tooltip key={group.phase} label={words} side="left">
                      <button
                        type="button"
                        data-glyph={group.phase}
                        aria-label={`${words}, open the Spec`}
                        className="flex rounded-md outline-none focus-ring"
                        onClick={() => unfold('mission', `[data-glyph="${group.phase}"]`)}
                      >
                        <PhaseGlyph phase={group.phase satisfies PhaseName} progress={progress} />
                      </button>
                    </Tooltip>
                  )
                })}
              </nav>
            )}
            {mission === 'build' && (
              <div className={BODY}>
                <Tooltip label="Build · T2 running" side="left">
                  <button
                    type="button"
                    data-glyph="build"
                    aria-label="Build, T2 running, open it"
                    className={GLYPH}
                    onClick={() => unfold('mission', '[data-glyph="build"]')}
                  >
                    <IconHammer size="md" aria-hidden="true" />
                    <span className={CORNER}>
                      <StatusDot status="running" size="sm" />
                    </span>
                  </button>
                </Tooltip>
              </div>
            )}
            <nav aria-label="This Session" className={BODY}>
              {PLACES.map((place) => {
                const glance = glanceOf(place, facts)
                return (
                  <Tooltip
                    key={place}
                    label={`${PLACE_WORDS[place]} · ${glance.words}`}
                    side="left"
                  >
                    <button
                      type="button"
                      data-glyph={place}
                      aria-label={`${PLACE_WORDS[place]}, ${glance.words}, open it`}
                      className={GLYPH}
                      onClick={() => unfold(place, `[data-glyph="${place}"]`)}
                    >
                      {PLACE_ICONS[place]}
                      {glance.tone !== null && (
                        <span className={CORNER}>
                          <StatusDot status={glance.tone} size="sm" />
                        </span>
                      )}
                    </button>
                  </Tooltip>
                )
              })}
            </nav>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
