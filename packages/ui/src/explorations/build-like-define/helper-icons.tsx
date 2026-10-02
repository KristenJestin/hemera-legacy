import type { ReactNode } from 'react'

import type { FaceState } from '../../components/face/states.ts'
import type { Helper } from './fixtures.ts'

/**
 * What a helper wears (issue #77, the maintainer's decision of 1 October): a letter avatar — a
 * small round tile with the helper's initial, in a colour of its own. The live face moved too much
 * for a chip; it stays in the helper's dialog, whose head it leads (`faceOf` below).
 *
 * - The initial is the first letter of the name; two helpers that share one take two letters each
 *   (the first letters of the first two words, or the first two of a single word).
 * - The colour is the helper's own, read from its name, so it never changes as others come and go:
 *   one of the tinted pairs the notices' kinds already wear, which pass AA in both themes.
 * - At the end it gives way to a plain tick or cross, as a run's icon does (`LiveChip`).
 */

/** The roles a defined helper can have, kept on the fixtures; a free helper has none. */
export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

/** On a chip, in a head, on its own. */
export type AvatarSize = 'sm' | 'md' | 'xl'

/** The tinted pairs an avatar can wear: a muted fill and its own foreground. */
const TONES = ['primary', 'info', 'success', 'warning', 'build'] as const

type Tone = (typeof TONES)[number]

const AVATAR: Record<AvatarSize, Record<Tone, string>> = {
  sm: {
    primary:
      'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold tracking-tighter text-primary-muted-foreground',
    info: 'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-info-muted text-xs font-semibold tracking-tighter text-info-muted-foreground',
    success:
      'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-success-muted text-xs font-semibold tracking-tighter text-success-muted-foreground',
    warning:
      'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-warning-muted text-xs font-semibold tracking-tighter text-warning-muted-foreground',
    build:
      'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full bg-mission-build-muted text-xs font-semibold tracking-tighter text-mission-build-muted-foreground',
  },
  md: {
    primary:
      'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary-muted-foreground',
    info: 'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-info-muted text-xs font-semibold text-info-muted-foreground',
    success:
      'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success-muted text-xs font-semibold text-success-muted-foreground',
    warning:
      'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-warning-muted text-xs font-semibold text-warning-muted-foreground',
    build:
      'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mission-build-muted text-xs font-semibold text-mission-build-muted-foreground',
  },
  xl: {
    primary:
      'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-base font-semibold text-primary-muted-foreground',
    info: 'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-info-muted text-base font-semibold text-info-muted-foreground',
    success:
      'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success-muted text-base font-semibold text-success-muted-foreground',
    warning:
      'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-muted text-base font-semibold text-warning-muted-foreground',
    build:
      'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-mission-build-muted text-base font-semibold text-mission-build-muted-foreground',
  },
}

/** A helper's own tone, read from its name: the same name, the same colour, every time. */
function toneOf(name: string): Tone {
  // A string hash (djb2), which spreads names over the tones better than a sum of their letters.
  const hash = [...name].reduce(
    (total, letter) => ((total * 33) ^ letter.charCodeAt(0)) >>> 0,
    5381,
  )
  return TONES[hash % TONES.length] ?? 'primary'
}

/** Two letters for a name: the first of its first two words, or its first two. */
function twoOf(name: string): string {
  const [first, second] = name.split(/\s+/)
  if (first !== undefined && second !== undefined) return `${first.charAt(0)}${second.charAt(0)}`
  return name.slice(0, 2)
}

/** A helper's initial, or two letters when another helper of the Session shares its initial. */
export function initialsOf(helper: Helper, helpers: readonly Helper[]): string {
  const initial = helper.name.charAt(0).toUpperCase()
  const shared = helpers.some(
    (other) => other.id !== helper.id && other.name.charAt(0).toUpperCase() === initial,
  )
  return shared ? twoOf(helper.name).toUpperCase() : initial
}

export interface HelperAvatarProps {
  helper: Helper
  /** The Session's helpers, which decide whether one letter is enough. */
  helpers: readonly Helper[]
  size?: AvatarSize | undefined
}

/** A helper's letter avatar, in its own colour. */
export function HelperAvatar({ helper, helpers, size = 'sm' }: HelperAvatarProps): ReactNode {
  const letters = initialsOf(helper, helpers)
  return (
    <span aria-hidden="true" className={AVATAR[size][toneOf(helper.name)]}>
      {letters}
    </span>
  )
}

/** What the face says to a screen reader. */
export const FACE_WORDS: Record<FaceState, string> = {
  loading: 'starting',
  thinking: 'thinking',
  reading: 'reading',
  writing: 'writing',
  running: 'running a command',
  checking: 'checking',
  question: 'asking',
  permission: 'asking for permission',
  blocked: 'silent, waiting',
  done: 'done',
  error: 'failed',
  asleep: 'stopped',
}

/** The face a helper wears: what its step does while it works, where it ended once it has. */
export function faceOf(helper: Helper): FaceState {
  if (helper.state === 'finished') return 'done'
  if (helper.state === 'failed') return 'error'
  if (helper.state === 'stopped') return 'asleep'
  if (helper.state === 'stuck') return 'blocked'
  const step = helper.steps.at(-1) ?? ''
  if (step.startsWith('Read') || step.startsWith('Search')) return 'reading'
  if (step.startsWith('Edit') || step.startsWith('Write')) return 'writing'
  if (step.startsWith('Run') || step.startsWith('Serve')) return 'running'
  return 'thinking'
}
