import {
  SECTION_TITLES,
  type Mark,
  type PhaseName,
  type PhaseState,
  type SpecTarget,
  type SpecView,
  shapedSectionsOf,
} from './model.ts'

/**
 * The Spec read as its phases, each with the parts it writes (lot 19, issue #150, issue #164):
 * what the column of the panel lays out one phase after the other, what the small frame it folds
 * to draws a glyph for, and how far along each of them is.
 *
 * How far along a part is is read from what is written and from the phase that writes it, the
 * phase being what the agent declares finished (D7-08): done once it is written and its phase
 * finished; started while it is being written, or written with its phase still open, pending or to
 * review; empty while nothing is written. A phase is done when every one of its parts is, empty
 * when none of them is begun, and started otherwise.
 */

/** One part of a phase: where it leads, what it is called, and its mark. */
export interface PartRow {
  target: SpecTarget
  label: string
  mark: Mark
}

/** A phase and the parts it writes, in the order the column lays them out. */
export interface PhaseGroup {
  phase: PhaseName
  state: PhaseState
  rows: PartRow[]
}

/** How far along a part, or a phase, is: the three tints of its glyph. */
export type Progress = 'done' | 'started' | 'empty'

/** The phases of a Spec: the type's shaped sections, the plan, and the three lists. */
export function phasesOf(spec: SpecView): PhaseGroup[] {
  const stateOf = (phase: PhaseName): PhaseState =>
    spec.phases.find((one) => one.name === phase)?.state ?? 'pending'
  const markOf = (target: SpecTarget): Mark =>
    spec.sections.find((section) => section.name === target)?.mark ?? 'empty'
  const decompose: PartRow[] = []
  // Stories are optional and mostly a `feature` matter (core.md, "Spec"): a Spec of another
  // type shows them only once it has one.
  if (spec.type === 'feature' || spec.stories.length > 0) {
    decompose.push({ target: 'stories', label: 'Stories', mark: spec.storiesMark })
  }
  decompose.push(
    { target: 'tasks', label: 'Tasks', mark: spec.tasksMark },
    { target: 'questions', label: 'Questions', mark: spec.questionsMark },
  )
  return [
    {
      phase: 'shape',
      state: stateOf('shape'),
      rows: shapedSectionsOf(spec.type).map((name) => ({
        target: name,
        label: SECTION_TITLES[name],
        mark: markOf(name),
      })),
    },
    {
      phase: 'plan',
      state: stateOf('plan'),
      rows: [{ target: 'plan', label: SECTION_TITLES.plan, mark: markOf('plan') }],
    },
    { phase: 'decompose', state: stateOf('decompose'), rows: decompose },
  ]
}

/**
 * How far along a part is: being written is started, whatever it holds; nothing written is empty;
 * to review is started; written is done once its phase is finished, and started until then.
 */
export function progressOf(state: Mark, phase: PhaseState): Progress {
  if (state === 'writing') return 'started'
  if (state === 'empty') return 'empty'
  // To review is not done, whatever its phase says: the agent has it to go over again.
  if (state === 'stale') return 'started'
  return phase === 'finished' ? 'done' : 'started'
}

/**
 * How far along a phase is: done when every part is, empty when none is begun, started else. The
 * part the agent is writing counts as being written, whatever its mark still says.
 */
export function phaseProgressOf(group: PhaseGroup, writing: SpecTarget | undefined): Progress {
  const each = group.rows.map((row) =>
    progressOf(row.target === writing ? 'writing' : row.mark, group.state),
  )
  if (each.length > 0 && each.every((one) => one === 'done')) return 'done'
  return each.some((one) => one !== 'empty') ? 'started' : 'empty'
}

/** How many of a phase's parts hold something. */
export function writtenOf(group: PhaseGroup): number {
  return group.rows.filter((row) => row.mark !== 'empty').length
}

/** Whether the agent is writing one of a phase's parts. */
export function isWriting(group: PhaseGroup, writing: SpecTarget | undefined): boolean {
  return writing !== undefined && group.rows.some((row) => row.target === writing)
}

/** How far along a phase is, in the words its glyph is named with. */
export const PROGRESS_WORDS: Record<Progress, string> = {
  done: 'done',
  started: 'started',
  empty: 'nothing written',
}

/** Where a phase stands, in the words its heading is named with. */
export const PHASE_STATE_WORDS: Record<PhaseState, string> = {
  finished: 'finished',
  open: 'open',
  pending: 'pending',
  stale: 'to review',
  unavailable: 'unavailable',
}

/** How much of a phase is written, as the quiet words beside its name say it. */
export function writtenWords(group: PhaseGroup): string {
  return `${writtenOf(group)} of ${group.rows.length} written`
}
