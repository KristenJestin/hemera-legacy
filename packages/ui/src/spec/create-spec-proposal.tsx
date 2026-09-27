import { cn } from 'cn'
import { type ReactNode, useState } from 'react'

import { Button } from '../components/button/button.tsx'
import { InPlaceText } from './in-place-text.tsx'
import type { SpecType } from './model.ts'
import { SPEC_TYPE_ICONS } from './spec-icons.ts'

/**
 * The agent proposing a Spec, in the thread of a `free` Session (lot 19, brief revision 2, "No
 * empty state"; D7-07).
 *
 * A `define` Session never exists without its Spec, so there is no empty panel to fill: the
 * conversation is where a Spec begins. The agent says what it understood — a title, editable in
 * place, and a type, one of three chips — and the reader answers `Create` or `Not now`. Created,
 * the Session becomes `define`, the panel opens beside the thread, and the thread stays as it is.
 *
 * Once answered, the block folds to the line that says what happened.
 *
 * The agent may find instead that what the user asks already has a Spec in the Project (issue
 * #198): it points to that one, by its key, and the reader answers `Continue it` — this Session
 * then defines that Spec, and the panel shows it — or `Not now`. Nothing is edited in that card:
 * the Spec exists, with its own title and type.
 */

const CARD = 'flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3'

const ASK = 'text-sm text-muted-foreground'

const TYPES = 'flex gap-1.5'

const TYPE =
  'flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium outline-none focus-ring hover:border-primary'

const TYPE_ON = 'border-primary bg-primary-muted text-primary-muted-foreground'

const TYPE_OFF = 'border-border text-muted-foreground'

const FOLDED = 'text-sm text-muted-foreground'

/** The Spec pointed to: its key in mono, as the panel's head says it, then its title. */
const EXISTING = 'flex min-w-0 items-baseline gap-2'

const EXISTING_KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const EXISTING_TITLE = 'min-w-0 truncate text-sm font-medium'

const EXISTING_TYPE = 'flex shrink-0 items-center gap-1 text-xs text-muted-foreground'

const ALL_TYPES: readonly SpecType[] = ['feature', 'bug', 'maintenance']

/** Where the proposal stands: waiting for the reader, or answered one way or the other. */
export type ProposalState = 'proposed' | 'created' | 'declined'

export interface CreateSpecProposalProps {
  /** The title the agent understood. */
  title: string
  /** The type the agent understood. */
  type: SpecType
  state?: ProposalState | undefined
  /** The key the Spec was given, once created: `ATL-7`. */
  createdKey?: string | undefined
  /**
   * The key of a Spec that already exists, when the agent points to it rather than proposing a
   * new one (issue #198): the card then offers to continue that Spec, and `onContinue` answers.
   */
  existingKey?: string | undefined
  /** Makes this Session define the existing Spec: the reader's `Continue it`. */
  onContinue?: (() => void) | undefined
  /** Creates the Spec with the title and the type as the reader left them. */
  onCreate: (title: string, type: SpecType) => void
  onDecline: () => void
}

export function CreateSpecProposal({
  title: proposed,
  type: understood,
  state = 'proposed',
  createdKey,
  existingKey,
  onContinue,
  onCreate,
  onDecline,
}: CreateSpecProposalProps): ReactNode {
  const [title, setTitle] = useState(proposed)
  const [type, setType] = useState(understood)
  if (existingKey !== undefined) {
    if (state === 'created') {
      return (
        <p role="status" className={FOLDED}>
          {`Continued ${existingKey} « ${proposed} » · this Session defines it now`}
        </p>
      )
    }
    if (state === 'declined') {
      return (
        <p className={FOLDED}>{`Not now: ${existingKey} « ${proposed} » was not continued.`}</p>
      )
    }
    return (
      <div role="group" aria-label="Continue a Spec" className={CARD}>
        <p className={ASK}>This Spec already exists</p>
        <p className={EXISTING}>
          <span className={EXISTING_KEY}>{existingKey}</span>
          <span className={EXISTING_TITLE}>{proposed}</span>
          <span className={EXISTING_TYPE}>
            <TypeIcon type={understood} />
            {understood}
          </span>
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDecline}>
            Not now
          </Button>
          <Button variant="primary" size="sm" onClick={onContinue}>
            Continue it
          </Button>
        </div>
      </div>
    )
  }
  if (state === 'created') {
    return (
      <p role="status" className={FOLDED}>
        {`Created ${createdKey ?? 'the Spec'} « ${title} » · ${type} · this Session defines it now`}
      </p>
    )
  }
  if (state === 'declined') {
    return <p className={FOLDED}>{`Not now: « ${title} » was not created.`}</p>
  }
  return (
    <div role="group" aria-label="Create a Spec" className={CARD}>
      <p className={ASK}>Create the Spec</p>
      <InPlaceText label="Title of the Spec" value={title} onCommit={setTitle} />
      <div role="radiogroup" aria-label="Type" className={TYPES}>
        {ALL_TYPES.map((one) => (
          <button
            key={one}
            type="button"
            role="radio"
            aria-checked={one === type}
            className={cn(TYPE, one === type ? TYPE_ON : TYPE_OFF)}
            onClick={() => setType(one)}
          >
            <TypeIcon type={one} />
            {one}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDecline}>
          Not now
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onCreate(title.trim() === '' ? proposed : title.trim(), type)}
        >
          Create
        </Button>
      </div>
    </div>
  )
}

/** The glyph of a type, beside its word on the chip (issue #130). */
function TypeIcon({ type }: { type: SpecType }): ReactNode {
  const Icon = SPEC_TYPE_ICONS[type]
  return <Icon size="sm" aria-hidden="true" />
}
