import type { ReactNode } from 'react'

/**
 * What a helper wears (issue #77, the maintainer's decision of 1 October): a round avatar with its
 * initial, in a colour of its own — in the slot of its `LiveChip`, and wherever it is named.
 *
 * - One letter, the first of its name; two when another helper of the Session shares that initial:
 *   the first of each of its first two words, or the first two of a single word.
 * - Its colour is read from its name, so it never changes as other helpers come and go: one of the
 *   theme's tinted pairs — a muted fill and its own ink — which pass AA in both themes. A helper's
 *   definition may give its own, which is worn instead.
 *
 * Decoration beside a name that is already said, so a screen reader is not told it twice.
 */

/** The tinted pairs an avatar can wear. */
export const HELPER_TONES = ['primary', 'info', 'success', 'warning', 'build'] as const

export type HelperTone = (typeof HELPER_TONES)[number]

const AVATAR: Record<HelperTone, string> = {
  primary:
    'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold tracking-tighter text-primary-muted-foreground',
  info: 'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-info-muted text-xs font-semibold tracking-tighter text-info-muted-foreground',
  success:
    'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-success-muted text-xs font-semibold tracking-tighter text-success-muted-foreground',
  warning:
    'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-warning-muted text-xs font-semibold tracking-tighter text-warning-muted-foreground',
  build:
    'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-mission-build-muted text-xs font-semibold tracking-tighter text-mission-build-muted-foreground',
}

/** A helper's own tone, read from its name: the same name, the same tone, every time. */
export function helperToneOf(name: string): HelperTone {
  // djb2, which spreads names over the tones better than a sum of their letters does.
  const hash = [...name].reduce(
    (total, letter) => ((total * 33) ^ letter.charCodeAt(0)) >>> 0,
    5381,
  )
  return HELPER_TONES[hash % HELPER_TONES.length] ?? 'primary'
}

/** A helper's initial, or two letters when one of `others` shares its initial. */
export function helperInitialsOf(name: string, others: readonly string[]): string {
  const initial = name.charAt(0).toUpperCase()
  if (!others.some((other) => other.charAt(0).toUpperCase() === initial)) return initial
  const [first = '', second] = name.split(/\s+/)
  const two = second === undefined ? first.slice(0, 2) : `${first.charAt(0)}${second.charAt(0)}`
  return two.toUpperCase()
}

export interface HelperAvatarProps {
  name: string
  /** The names of the Session's other helpers, which decide whether one letter is enough. */
  others?: readonly string[] | undefined
  /** The colour its definition gives it, worn instead of the one read from its name. */
  tone?: HelperTone | undefined
}

export function HelperAvatar({ name, others = [], tone }: HelperAvatarProps): ReactNode {
  return (
    <span aria-hidden="true" className={AVATAR[tone ?? helperToneOf(name)]}>
      {helperInitialsOf(name, others)}
    </span>
  )
}
