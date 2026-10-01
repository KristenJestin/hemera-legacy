import type { ClassifierSectionProps } from '@hemera/ui'

type Evaluator = ClassifierSectionProps['evaluator']

/**
 * What App Settings says of Hemera Auto's evaluator (D59-06): a change in progress first, then
 * unavailable when its settings did not read. The key and the consent are said beside it, each
 * by its own state, so they are not folded in here.
 */
export function settingsEvaluator(read: {
  readonly busy: boolean
  readonly failed: boolean
}): Evaluator {
  if (read.busy) return 'transitioning'
  return read.failed ? 'unavailable' : 'ready'
}

/**
 * What the model menu says of it (D59-11), in one state: unavailable whenever a call would have
 * to ask for want of it — no key, a rejected one, no protected storage, no consent, or settings
 * that did not read.
 */
export function menuStatus(read: {
  readonly busy: boolean
  readonly failed: boolean
  readonly credential: ClassifierSectionProps['credential']
  readonly consent: boolean
}): Evaluator {
  const settings = settingsEvaluator(read)
  if (settings !== 'ready') return settings
  return read.credential === 'saved' && read.consent ? 'ready' : 'unavailable'
}
