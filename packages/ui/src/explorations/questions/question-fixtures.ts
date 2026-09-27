import type { PhaseName, SpecAnswer, SpecQuestionView } from '../../spec/model.ts'

/**
 * The questions the explorations of issue #182 are drawn with: one that holds the Spec, one that
 * does not, and the answers a reader gives them.
 */

/** A question of `shape` that holds the Spec, its second choice the one recommended. */
export const SPLIT: SpecQuestionView = {
  id: 'q-split',
  body: 'How should the export be split when it covers **a whole year**?',
  blocking: true,
  phase: 'shape',
  options: [
    { id: 'single', label: 'One CSV for the whole year' },
    { id: 'monthly', label: 'One CSV per month', recommended: true },
    { id: 'client', label: 'One CSV per client' },
  ],
  answer: null,
}

/** A question of `plan` the Spec goes on without. */
export const FILE_NAME: SpecQuestionView = {
  id: 'q-file-name',
  body: 'Should the file name carry the month in words or in digits?',
  blocking: false,
  phase: 'plan',
  options: [
    { id: 'digits', label: 'In digits: export-2026-03.csv', recommended: true },
    { id: 'words', label: 'In words: export-march-2026.csv' },
  ],
  answer: null,
}

/** The reader's choice of the recommended split. */
export const CHOSE_MONTHLY: SpecAnswer = { optionId: 'monthly' }

/** A choice the agent did not recommend. */
export const CHOSE_CLIENT: SpecAnswer = { optionId: 'client' }

/** The reader's own words, under `Write my own answer`. */
export const OWN_WORDS = 'One per month, and one more for the whole year for the accountant.'

/** What the reader writes and gives in a play: another answer nobody offered. */
export const TYPED_WORDS = 'One per quarter.'

/** A phase as the card says it, with its capital. */
export function phaseLabel(phase: PhaseName): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1)
}

/** The letter of the choice at `index`: A for the first, and the next for the reader's own. */
export function letterOf(index: number): string {
  return String.fromCodePoint(65 + index)
}

/** What a picked answer shows: the choice's letter and label, or the reader's own words. */
export interface Picked {
  /** A, B, C…, the letter the card gave it; the next letter for the reader's own answer. */
  letter: string
  /** The label of the choice, or the reader's own words. */
  label: string
  /** Whether it is the reader's own answer rather than one of the choices. */
  own: boolean
  recommended: boolean
}

/** The choice an answer names, as the card lettered it. */
export function pickedOf(question: SpecQuestionView, answer: SpecAnswer): Picked {
  const index = question.options.findIndex((option) => option.id === answer.optionId)
  const option = question.options[index]
  if (option === undefined) {
    return {
      letter: letterOf(question.options.length),
      label: answer.text ?? '',
      own: true,
      recommended: false,
    }
  }
  return {
    letter: letterOf(index),
    label: option.label,
    own: false,
    recommended: option.recommended === true,
  }
}
