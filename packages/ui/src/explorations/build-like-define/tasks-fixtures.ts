import {
  T1_DONE,
  T2_WORKING,
  T3_BLOCKED,
  T3_CHECKING_TASK,
  T4,
} from '../../build/build-fixtures.ts'
import type { BuildTaskView } from '../../build/model.ts'
import type { HelperIconName } from './helper-icons.tsx'

/**
 * A bigger build of `ATL-7` than the view's own fixtures, so the tasks read as a build does once
 * it is under way: ten tasks over three stories, some done, some in progress, some to do, one
 * blocked and one the user's. The tasks are the build view's own, copied under other labels.
 */

export interface TaskStory {
  id: string
  key: string
  title: string
}

export const TASK_STORIES: readonly TaskStory[] = [
  { id: 'story-export-a-month', key: 'S1', title: 'Export a month' },
  { id: 'story-credit-notes', key: 'S2', title: 'Credit notes in the same file' },
  { id: 'story-pick-month', key: 'S3', title: 'Pick the month' },
]

/** What came back on a task: a helper's return, the user's feedback, the main agent's word. */
export interface TaskReturn {
  id: string
  from: string
  /** A helper's icon, or `you` or `agent`. */
  icon: HelperIconName | 'you' | 'agent'
  verdict: 'green' | 'red' | 'note'
  text: string
}

export interface BoardTask extends BuildTaskView {
  returns: readonly TaskReturn[]
}

function task(
  from: BuildTaskView,
  label: string,
  title: string,
  more: Partial<BuildTaskView> = {},
  returns: readonly TaskReturn[] = [],
): BoardTask {
  const id = `bt-${label.toLowerCase()}`
  return { ...from, id, taskId: `task-${label}`, label, title, ...more, returns }
}

const S1 = ['story-export-a-month']
const S2 = ['story-credit-notes']
const S3 = ['story-pick-month']

export const BOARD: readonly BoardTask[] = [
  task(T1_DONE, 'T1', 'The invoice lines of the month, streamed', { storyIds: S1 }, [
    {
      id: 'r1',
      from: 'Test review',
      icon: 'reviewer',
      verdict: 'green',
      text: 'Both criteria are proved: an empty month returns no line, 10 000 lines stream in 1.2 s.',
    },
  ]),
  task(T2_WORKING, 'T2', 'A CSV in the column order of the ledger', { storyIds: S1 }, [
    {
      id: 'r2',
      from: 'You',
      icon: 'you',
      verdict: 'note',
      text: 'The ledger wants the invoice number before the client.',
    },
    {
      id: 'r3',
      from: 'Main agent',
      icon: 'agent',
      verdict: 'red',
      text: 'Try 1 was red on the header order. Moving the number, then the test again.',
    },
  ]),
  task(T1_DONE, 'T3', 'Stream the rows in pages of 500', { storyIds: S1 }),
  task(T3_CHECKING_TASK, 'T4', 'Credit notes as negative rows', { storyIds: S2 }),
  task(T3_BLOCKED, 'T5', 'Credit notes keep their invoice number', { storyIds: S2 }, [
    {
      id: 'r4',
      from: 'Main agent',
      icon: 'agent',
      verdict: 'red',
      text: 'The ledger refuses two rows with the same number in one file.',
    },
  ]),
  task(T1_DONE, 'T6', 'The month picker on the billing page', { storyIds: S3 }),
  task(T1_DONE, 'T7', 'Remember the last month picked', { storyIds: S3 }),
  task(T4, 'T8', 'Months with no invoice are disabled', {
    executor: 'agent',
    type: 'feature',
    state: 'ready',
    storyIds: S3,
    dependsOn: ['T6'],
  }),
  task(T4, 'T9', 'The export page of the documentation', {
    executor: 'agent',
    type: 'docs',
    state: 'waiting',
    storyIds: S1,
    dependsOn: ['T2', 'T4'],
  }),
  task(T4, 'T10', 'The file imports into the ledger', { storyIds: [...S1, ...S2] }),
]
