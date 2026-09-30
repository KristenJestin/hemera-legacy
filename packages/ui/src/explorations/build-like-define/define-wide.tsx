import { type ReactNode, useEffect, useRef, useState } from 'react'

import { PHASE_TITLES, type SpecTarget, type SpecView } from '../../spec/model.ts'
import { PhaseGlyph } from '../../spec/phase-glyph.tsx'
import { SpecPart } from '../../spec/spec-part.tsx'
import {
  type PhaseGroup,
  isWriting,
  phaseProgressOf,
  writtenWords,
} from '../../spec/spec-phases.ts'

/**
 * The Spec laid over the chat (maintainer's feedback of 30 September on issue #77): the width goes
 * to reading, and the way through the Spec becomes a sidebar.
 *
 * On the left, the phases one under the other — each its glyph, tinted by how far along it is,
 * its name and how much of it is written — and under each, its sections, a press going to one.
 * The one being read is marked, and follows the reading. It replaces the menu the phase headings
 * open beside the chat.
 *
 * The rest of the width is the Spec's own text, one column at a reading measure, its phases parted
 * by a quiet rule and its questions in their place in the flow.
 */

const COLUMNS = 'flex min-h-0 flex-1'

const NAV =
  'flex w-sidebar shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface-rim px-3 py-4'

const PHASE =
  'flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent focus-ring'

const PHASE_NAME = 'flex min-w-0 flex-col'

const PHASE_WORDS = 'text-xs text-muted-foreground'

/** A phase's sections, on a rule that runs down from its glyph. */
const SECTIONS = 'ml-4 flex flex-col border-l border-border pl-2'

const SECTION =
  'relative -ml-2.5 rounded-r-md border-l-2 border-transparent py-1 pr-2 pl-4 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-ring data-current:border-primary data-current:font-medium data-current:text-foreground'

const READER = 'relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-ring'

const PAGE = 'mx-auto flex max-w-3xl flex-col px-8 pt-6 pb-24'

const PHASE_RULE =
  'flex items-center gap-2 border-b border-border pt-10 pb-2 text-xs font-medium text-muted-foreground first:pt-0'

const PARTS = 'flex flex-col gap-8 pt-6'

export interface DefineWideProps {
  spec: SpecView
  groups: PhaseGroup[]
  still: boolean
}

export function DefineWide({ spec, groups, still }: DefineWideProps): ReactNode {
  const reader = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<SpecTarget | null>(groups[0]?.rows[0]?.target ?? null)

  // The part being read is the first one showing in the top third of the reader.
  useEffect(() => {
    const root = reader.current
    if (root === null) return
    const showing = new Set<string>()
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const part = entry.target.getAttribute('data-part')
          if (part === null) continue
          if (entry.isIntersecting) showing.add(part)
          else showing.delete(part)
        }
        const order = groups.flatMap((group) => group.rows.map((row) => row.target))
        const first = order.find((target) => showing.has(target))
        if (first !== undefined) setCurrent(first)
      },
      { root, rootMargin: '0px 0px -66% 0px' },
    )
    for (const part of root.querySelectorAll('[data-part]')) watch.observe(part)
    return () => watch.disconnect()
  }, [groups])

  function goTo(target: SpecTarget): void {
    const root = reader.current
    const part = root?.querySelector<HTMLElement>(`[data-part="${target}"]`)
    if (root === null || root === undefined || part === null || part === undefined) return
    setCurrent(target)
    root.scrollTo({ top: part.offsetTop - 24, behavior: still ? 'instant' : 'smooth' })
  }

  return (
    <div className={COLUMNS}>
      <nav aria-label={`Outline of ${spec.key}`} className={NAV}>
        {groups.map((group) => {
          const writing = isWriting(group, spec.focus)
          return (
            <div key={group.phase} className="flex flex-col gap-1">
              <button
                type="button"
                className={PHASE}
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
                <span className={PHASE_NAME}>
                  <span className="text-sm font-medium">{PHASE_TITLES[group.phase]}</span>
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
        aria-label={`Contents of ${spec.key}`}
        tabIndex={0}
        className={READER}
      >
        <div className={PAGE}>
          {groups.map((group) => (
            <section
              key={group.phase}
              aria-label={`${PHASE_TITLES[group.phase]} phase`}
              className="flex flex-col"
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
        </div>
      </div>
    </div>
  )
}
