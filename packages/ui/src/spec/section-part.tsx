import type { ReactNode } from 'react'

import { Loading } from '../components/loading/loading.tsx'
import { AgentText } from '../message/agent-text.tsx'
import { SECTION_TITLES, type SectionView } from './model.ts'
import { PartHead } from './part-head.tsx'

/**
 * One section of the Spec document, read (lot 19, brief revision 2; issue #135).
 *
 * The agent writes the Spec and the reader reads it and answers: a section is always drawn as its
 * Markdown rendered, with nothing to edit, no preview to toggle and no editing look at all. The
 * facts beside the heading say who wrote it and what is happening to it; whether the Spec is a
 * draft or ready is the head's status to say, and no section repeats it.
 */

const NOTE = 'mt-1 text-xs text-muted-foreground'

const WARN = 'text-warning-muted-foreground'

const EMPTY = 'text-sm text-muted-foreground'

const WRITING = 'flex items-center gap-1.5'

export interface SectionPartProps {
  section: SectionView
}

export function SectionPart({ section }: SectionPartProps): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <PartHead title={SECTION_TITLES[section.name]} mark={section.mark} facts={factsOf(section)} />
      {section.body === '' ? (
        // Being written, it says so in the place of the empty line at once, and goes back to it
        // if the write fails; the text that arrives replaces both (issue #185).
        section.mark === 'writing' ? (
          <p className={EMPTY}>
            <Writing words="Writing…" />
          </p>
        ) : (
          <p className={EMPTY}>Nothing written yet.</p>
        )
      ) : (
        <AgentText text={section.body} />
      )}
      {section.note !== undefined && <p className={NOTE}>{section.note}</p>}
    </div>
  )
}

/**
 * What the facts say of a section, in the reader's words: `you` when you wrote it last and
 * nothing when the agent did, and what is happening to it. No version and no revision: those are
 * the engine's bookkeeping, not something the reader acts on.
 */
function factsOf(section: SectionView): ReactNode[] {
  const yours: ReactNode[] = section.author === 'human' ? ['you'] : []
  // A section with nothing in it says it is being written in its body, not twice.
  if (section.author === null) return []
  if (section.copiedFrom !== undefined) {
    return [
      ...yours,
      <span key="stale" className={WARN}>
        to review
      </span>,
    ]
  }
  if (section.mark === 'writing') return [...yours, <Writing key="writing" words="writing…" />]
  return yours
}

/**
 * The design system's loader and the word, which is how a section says the agent is writing it.
 * The heading already says it to a screen reader, so the word is for the eye alone.
 */
function Writing({ words }: { words: string }): ReactNode {
  return (
    <span className={WRITING}>
      <Loading size="sm" label="Writing" />
      <span aria-hidden="true">{words}</span>
    </span>
  )
}
