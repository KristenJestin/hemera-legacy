import { type ReactNode, useRef, useState } from 'react'

import { PHASE_TITLES, type SpecTarget, type SpecView, specCalledOf } from './model.ts'
import { PhaseGlyph } from './phase-glyph.tsx'
import { SpecPart } from './spec-part.tsx'
import { type PhaseGroup, isWriting, phaseProgressOf, writtenWords } from './spec-phases.ts'

/**
 * The Spec laid over the chat (#77): the width goes to reading, and the way through the Spec
 * becomes a sidebar in place of the menu its phase headings open beside the chat.
 *
 * On the left, the phases one under the other — each its glyph, tinted by how far along it is, its
 * name and how much of it is written — and under each, its sections on a line that runs down from
 * the glyph, a press going to one. The one being read is marked, and follows the reading: it is the
 * last part whose top has come up to the reader's top.
 *
 * The rest of the width is the Spec's own text, one column at a reading measure, its phases parted
 * by a quiet rule, every part where the column beside the chat has it.
 */

const COLUMNS = 'flex min-h-0 flex-1'

/** The sidebar, on the Spec's own surface and parted from the text by a rule. */
const NAV =
  'flex w-sidebar shrink-0 flex-col gap-5 overflow-y-auto border-r border-border px-3 py-4'

const PHASE =
  'flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent focus-ring'

const PHASE_WORDS = 'text-xs text-muted-foreground'

/** A phase's sections, one under the other from its glyph, their edges one line down. */
const SECTIONS = 'ml-4 flex flex-col'

/**
 * A section: the ink of the text, its edge a piece of the line, and the one being read on the
 * primary's tint, its piece of the line the primary — a mark that reads in both themes, never grey
 * on grey.
 */
const SECTION =
  'rounded-r-md border-l-2 border-border py-1 pr-2 pl-3 text-left text-sm text-foreground outline-none hover:bg-accent focus-ring data-current:border-primary data-current:bg-primary-muted data-current:font-medium data-current:text-primary-muted-foreground'

const READER = 'relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-ring'

/** A phase of the text, at a reading measure. */
const PHASE_PART = 'mx-auto flex w-full max-w-3xl flex-col px-8 pt-10 first:pt-6'

/** Room under the text, the reader's height, so that its last part can come up to the top too. */
const ROOM = 'h-full'

const PHASE_RULE =
  'flex items-center gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground'

const PARTS = 'flex flex-col gap-8 pt-6'

/** How far under the reader's top a part is brought when gone to, and read from: a breath. */
const BREATH = 24

export interface SpecWideProps {
  spec: SpecView
  /** The Spec's phases, and the parts each one writes. */
  groups: PhaseGroup[]
  /** Whether a part is gone to at once rather than scrolled to: less movement asked for. */
  still: boolean
}

export function SpecWide({ spec, groups, still }: SpecWideProps): ReactNode {
  const reader = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<SpecTarget | null>(groups[0]?.rows[0]?.target ?? null)

  /** The part being read: the last one whose top has come up to the reader's top. */
  function follow(): void {
    const root = reader.current
    if (root === null) return
    let reached: SpecTarget | null = null
    for (const group of groups) {
      for (const row of group.rows) {
        const part = root.querySelector<HTMLElement>(`[data-part="${row.target}"]`)
        if (part !== null && part.offsetTop - BREATH <= root.scrollTop + 1) reached = row.target
      }
    }
    setCurrent(reached ?? groups[0]?.rows[0]?.target ?? null)
  }

  function goTo(target: SpecTarget): void {
    const root = reader.current
    const part = root?.querySelector<HTMLElement>(`[data-part="${target}"]`)
    if (root === null || root === undefined || part === null || part === undefined) return
    setCurrent(target)
    root.scrollTo({ top: part.offsetTop - BREATH, behavior: still ? 'instant' : 'smooth' })
  }

  return (
    <div className={COLUMNS}>
      <nav aria-label={`Outline of ${specCalledOf(spec)}`} className={NAV}>
        {groups.map((group) => {
          const writing = isWriting(group, spec.focus)
          const title = PHASE_TITLES[group.phase]
          return (
            <div key={group.phase} className="flex flex-col gap-1">
              <button
                type="button"
                className={PHASE}
                aria-label={`${title}, ${writtenWords(group)}`}
                onClick={() => {
                  const first = group.rows[0]
                  if (first !== undefined) goTo(first.target)
                }}
              >
                <PhaseGlyph
                  phase={group.phase}
                  progress={phaseProgressOf(group, spec.focus)}
                  writing={writing}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-foreground">{title}</span>
                  <span className={PHASE_WORDS}>
                    {writing ? `${writtenWords(group)} · writing…` : writtenWords(group)}
                  </span>
                </span>
              </button>
              <div className={SECTIONS}>
                {group.rows.map((row) => (
                  <button
                    key={row.target}
                    type="button"
                    className={SECTION}
                    data-current={current === row.target ? '' : undefined}
                    aria-current={current === row.target ? 'location' : undefined}
                    onClick={() => goTo(row.target)}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div
        ref={reader}
        role="region"
        aria-label={`Contents of ${specCalledOf(spec)}`}
        tabIndex={0}
        className={READER}
        onScroll={follow}
      >
        {groups.map((group) => (
          <section
            key={group.phase}
            data-phase={group.phase}
            aria-label={`${PHASE_TITLES[group.phase]} phase`}
            className={PHASE_PART}
          >
            <span className={PHASE_RULE}>{PHASE_TITLES[group.phase]}</span>
            <div className={PARTS}>
              {group.rows.map((row) => (
                <div key={row.target} data-part={row.target}>
                  <SpecPart spec={spec} target={row.target} />
                </div>
              ))}
            </div>
          </section>
        ))}
        <div aria-hidden="true" className={ROOM} />
      </div>
    </div>
  )
}
