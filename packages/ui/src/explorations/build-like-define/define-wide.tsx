import { type ReactNode, type RefObject, useState } from 'react'

import type { SpecAnswer, SpecView } from '../../spec/model.ts'
import { PHASE_TITLES } from '../../spec/model.ts'
import { PhaseGlyph } from '../../spec/phase-glyph.tsx'
import { SpecColumn, goToPhase } from '../../spec/spec-column.tsx'
import { type PhaseGroup, isWriting, phaseProgressOf } from '../../spec/spec-phases.ts'
import { SpecQuestion } from '../../spec/spec-question.tsx'

/**
 * The Spec laid over the chat (maintainer's feedback of 30 September on issue #77): the width
 * shows more, not the same column spread out. Three columns:
 *
 * - on the left, the outline: each phase with its glyph and the parts it writes, a press going to
 *   it, then the stories, key and title;
 * - in the middle, the Spec as it reads beside the chat, at a reading measure;
 * - on the right, the questions still open, answered there as in the thread.
 */

const COLUMNS = 'flex min-h-0 flex-1'

const OUTLINE =
  'flex w-sidebar shrink-0 flex-col gap-5 overflow-y-auto border-r border-border px-4 py-4'

const PART_HEAD = 'text-xs font-medium text-muted-foreground'

const PHASE =
  'flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm font-medium outline-none hover:bg-accent focus-ring'

const PART = 'truncate pl-10 text-xs text-muted-foreground'

const STORY = 'flex min-w-0 items-baseline gap-2 text-sm'

const READING = 'relative flex min-w-0 flex-1 flex-col'

const QUESTIONS =
  'flex w-menu-panel shrink-0 flex-col gap-3 overflow-y-auto border-l border-border px-4 py-4'

export interface DefineWideProps {
  spec: SpecView
  groups: PhaseGroup[]
  column: RefObject<HTMLDivElement | null>
  still: boolean
}

export function DefineWide({ spec, groups, column, still }: DefineWideProps): ReactNode {
  const [answers, setAnswers] = useState<Record<string, SpecAnswer>>({})
  const open = spec.questions.filter((question) => question.answer === null)
  return (
    <div className={COLUMNS}>
      <nav aria-label={`Outline of ${spec.key}`} className={OUTLINE}>
        <div className="flex flex-col gap-2">
          <span className={PART_HEAD}>Outline</span>
          {groups.map((group) => (
            <div key={group.phase} className="flex flex-col gap-0.5">
              <button
                type="button"
                className={PHASE}
                onClick={() => goToPhase(column, group.phase, still)}
              >
                <PhaseGlyph
                  phase={group.phase}
                  progress={phaseProgressOf(group, spec.focus)}
                  writing={isWriting(group, spec.focus)}
                />
                {PHASE_TITLES[group.phase]}
              </button>
              {group.rows.map((row) => (
                <span key={row.target} className={PART}>
                  {row.label}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={PART_HEAD}>Stories</span>
          {spec.stories.map((story) => (
            <span key={story.id} className={STORY}>
              <span className="font-mono text-xs text-muted-foreground">{story.key}</span>
              <span className="min-w-0 truncate">{story.title}</span>
            </span>
          ))}
        </div>
      </nav>
      <div className={READING}>
        <SpecColumn spec={spec} groups={groups} column={column} still={still} />
      </div>
      <aside aria-label="Open questions" className={QUESTIONS}>
        <span className={PART_HEAD}>Questions · {open.length}</span>
        {open.map((question) => (
          <SpecQuestion
            key={question.id}
            question={{ ...question, answer: answers[question.id] ?? null }}
            onAnswer={(answer) => setAnswers({ ...answers, [question.id]: answer })}
          />
        ))}
      </aside>
    </div>
  )
}
