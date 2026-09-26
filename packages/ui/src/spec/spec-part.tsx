import type { ReactNode } from 'react'

import type { SectionName, SectionView, SpecTarget, SpecView } from './model.ts'
import { QuestionsPart } from './questions-part.tsx'
import { SectionPart } from './section-part.tsx'
import { StoriesPart } from './stories-part.tsx'
import { TasksPart } from './tasks-part.tsx'

/** What a part does with the reader's hand, handed down from the panel. */
export interface SpecPartHandlers {
  /** Takes the thread to where an open question is asked. */
  onGoToQuestion: (id: string) => void
}

/** A section of the revision, or the empty one its name stands for while nothing is written. */
function sectionOf(spec: SpecView, name: SectionName): SectionView {
  return (
    spec.sections.find((section) => section.name === name) ?? {
      name,
      body: '',
      author: null,
      mark: 'empty',
    }
  )
}

export interface SpecPartProps extends SpecPartHandlers {
  spec: SpecView
  target: SpecTarget
}

/** One part of the Spec, drawn by the part of its kind: a section, or one of the three lists. */
export function SpecPart({ spec, target, onGoToQuestion }: SpecPartProps): ReactNode {
  if (target === 'stories') {
    return <StoriesPart stories={spec.stories} mark={spec.storiesMark} type={spec.type} />
  }
  if (target === 'tasks') return <TasksPart tasks={spec.tasks} mark={spec.tasksMark} />
  if (target === 'questions') {
    return (
      <QuestionsPart
        questions={spec.questions}
        mark={spec.questionsMark}
        onGoToQuestion={onGoToQuestion}
      />
    )
  }
  return <SectionPart section={sectionOf(spec, target)} />
}
