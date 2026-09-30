import type { ReactNode } from 'react'

import { Face, type FaceSize } from '../../components/face/face.tsx'
import type { FaceState } from '../../components/face/states.ts'
import type { Helper } from './fixtures.ts'

/**
 * What a helper wears (issue #77, the maintainer's direction of 30 September): helpers are agents,
 * so they wear the agent's face and not an icon — agents are faces, commands are icons. The same
 * face for every helper, live: its expression says what the helper is doing, as in its dialog.
 * The role is the chip's name alone. At the end the face gives way to a plain tick or cross, as a
 * run's icon does. Recommended.
 *
 * The alternative, for comparison (story `HelperIcons`): a small tile with the role's initial.
 */

/** The roles a defined helper can have, kept on the fixtures; a free helper has none. */
export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

export type HelperLook = 'face' | 'monogram'

/** On a chip, in a head, on its own. */
export type HelperMarkSize = 'sm' | 'md' | 'xl'

/** The face's own steps: 18, 24 and 40 px. */
const FACE_SIZES: Record<HelperMarkSize, FaceSize> = { sm: 'icon', md: 'sm', xl: 'md' }

/** The monogram's tile: 16, 20 and 40 px. */
const TILE: Record<HelperMarkSize, string> = {
  sm: 'inline-flex size-icon-sm shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground',
  md: 'inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground',
  xl: 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-lg font-semibold text-foreground',
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

/** A seed of its own for each helper, so two faces side by side never move in step. */
function seedOf(helper: Helper): number {
  return [...helper.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0)
}

export interface HelperMarkProps {
  helper: Helper
  look?: HelperLook | undefined
  size?: HelperMarkSize | undefined
}

/** A helper's mark: its live face, or its role's initial on a tile. */
export function HelperMark({ helper, look = 'face', size = 'sm' }: HelperMarkProps): ReactNode {
  if (look === 'monogram') {
    return (
      <span aria-hidden="true" className={TILE[size]}>
        {helper.name.charAt(0)}
      </span>
    )
  }
  return (
    <Face
      state={faceOf(helper)}
      size={FACE_SIZES[size]}
      seed={seedOf(helper)}
      label={`${helper.name}, ${FACE_WORDS[faceOf(helper)]}`}
    />
  )
}
