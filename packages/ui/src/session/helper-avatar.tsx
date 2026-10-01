import type { ReactNode } from 'react'

/**
 * What a helper wears (issue #77, the maintainer's decision of 1 October): a round avatar with its
 * initial, in a colour of its own — in the slot of its `LiveChip`, and wherever it is named.
 *
 * - One letter, the first of its name; two when another helper of the Session shares that initial,
 *   never the same two as another's (`helperInitialsOf`).
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

/**
 * A helper's initial, or two letters when one of `others` shares its initial, chosen so that no two
 * helpers of the line wear the same letters:
 *
 * - the first of each of its first two words, or the first two of a single word;
 * - when that is worn twice among the helpers sharing the initial (Reviewer and Researcher), the
 *   initial and the letter at the first place where all their names differ (RV, RS);
 * - failing that, the initial and the last letter (Explore and Explorer: EE, ER).
 *
 * Two helpers of the same name cannot be told apart, and wear the same letters.
 */
export function helperInitialsOf(name: string, others: readonly string[]): string {
  const initial = name.charAt(0).toUpperCase()
  const sharing = [
    ...new Set([name, ...others].filter((one) => one.charAt(0).toUpperCase() === initial)),
  ]
  if (sharing.length === 1) return initial
  const plain = sharing.map(twoLettersOf)
  if (new Set(plain).size === sharing.length) return twoLettersOf(name)
  const letters = sharing.map((one) => one.replace(/\s+/g, '').toUpperCase())
  const own = name.replace(/\s+/g, '').toUpperCase()
  const longest = Math.max(...letters.map((one) => one.length))
  for (let at = 1; at < longest; at += 1) {
    const there = letters.map((one) => one.charAt(at))
    if (there.every((letter) => letter !== '') && new Set(there).size === sharing.length) {
      return `${initial}${own.charAt(at)}`
    }
  }
  const lasts = letters.map((one) => one.charAt(one.length - 1))
  if (new Set(lasts).size === sharing.length) return `${initial}${own.charAt(own.length - 1)}`
  return twoLettersOf(name)
}

/** The first of each of a name's first two words, or the first two letters of a single word. */
function twoLettersOf(name: string): string {
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
