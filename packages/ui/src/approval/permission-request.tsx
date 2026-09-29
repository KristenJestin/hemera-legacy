import type { ReactNode } from 'react'

import { type NoticeAnswer, NoticeRecord } from '../activity/notice-record.tsx'
import { IconShield } from '../icons.ts'
import { type NoticeAnswerButton, NoticeRow } from '../session/notice-row.tsx'
import { RepositoryGlyph, type RunRepository } from '../session/run-place.tsx'
import { DecisionSummary } from './decision-summary.tsx'

/**
 * The gate: the turn is stopped, and it does not go on until someone answers (design D17-09).
 *
 * An agent that is allowed to edit files has to be told when it may. The answer is not a
 * dialogue — it is a decision, taken once, about one call — so the card says what the call would
 * do, the parameters that decide the answer, and the complete change when the call carries one.
 * A gate that hides what it is guarding is a gate people learn to open without reading.
 *
 * The buttons are the agent's options, all of them: the refusal first, the one-shot permission
 * last where every notice accepts, and a standing rule between, because a rule that outlives the
 * request is the one answer that deserves a second look. Nothing here invents an
 * answer the agent did not offer — a client that offers "allow always" to an agent that only
 * asked once is a client that widens a permission on its own.
 *
 * The card does not take the keyboard: it arrives while the reader is somewhere else, and
 * stealing the caret from a half-written sentence is how a prompt stops being finished. Tab walks
 * the answers and Enter is the focused button's own press. Escape answers nothing: among the
 * notices it closes them, and a reader putting the panel away has refused nothing. It is drawn
 * as every notice is (`NoticeRow`, review of #250): one row — the line a one-off would run, or the
 * call's label and what it is about — with the answers every notice has, the refusal quiet, the
 * one-shot permission primary, a standing rule between the two with how long it is remembered;
 * the chevron unfolds the whole line and where it would run.
 *
 * The head reads the way the call's own line does (recette 3 of 23 September 2026): what a reader
 * calls the tool, what it is about, and what it asks — "Write file ../outside.txt asks to act
 * outside the Workspace" — rather than the tool's code name above a sentence that repeats it.
 * Without a label, the tool's name heads the card and the sentence stands under it, as before.
 *
 * It says each thing once (issue #237): it is drawn among the Session's notices, which already say
 * that something waits, so it wears no badge, no heading of its own, and no sentence explaining why
 * it asks — what the call is, where it would run, and the whole line it would run, wrapped rather
 * than cut, then the answers. The agent's own sentence is read only where nothing else says what
 * the call is: a question with no label.
 */
/** What the call would do, in the agent's own sentence. */
const INTENT = 'text-sm text-muted-foreground'

/** What the call is about, on the head: the face a path and a command are written in. */
const SUBJECT = 'font-mono text-xs'

/** The parameters that decide the answer: a label, and the value it holds. */
const PARAMETERS = 'flex flex-wrap gap-x-3 gap-y-1 text-xs'

const PARAMETER = 'flex items-baseline gap-2'

const LABEL = 'shrink-0 text-xs text-muted-foreground'

const VALUE = 'min-w-0 truncate font-mono text-foreground'

/** A value that is one of the Project's repositories: its mark, then its name. */
const REPOSITORY_VALUE = 'flex min-w-0 items-center gap-1 font-mono text-foreground'

/** The command or the path the decision is about, in the font that reads as an instruction. */
const COMMAND =
  'rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-foreground'

/** The kinds of option an agent may offer, as the protocol names them. */
export type PermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'

export interface PermissionOption {
  /** The id the agent gave this option; it is what goes back in the reply. */
  optionId: string
  kind: PermissionOptionKind
  /** What the agent calls it, shown as it is: the agent is the one that owns the words. */
  name: string
}

/** A parameter of the call that a reader would want before answering. */
export interface PermissionParameter {
  label: string
  value: string
  /**
   * The repository of the Project the value names, drawn with its mark (issue #239): a place that
   * is a repository is said as one, and never as a plain folder.
   */
  repository?: RunRepository | undefined
}

export interface PermissionRequestProps {
  /** The tool the agent wants to use, as the agent names it. */
  toolName: string
  /**
   * What a reader calls the tool — `Write file`, `Run command` — as the call's own line says it.
   * Given, the head reads the label, the subject and the intent as one line.
   */
  label?: string | undefined
  /** What the call is about: the path as the agent named it, the command line. */
  subject?: string | undefined
  /**
   * What the call would do, in the agent's own sentence: read only on a question with no label,
   * where nothing else says what the call is.
   */
  intent?: string | undefined
  /** The parameters that decide the answer, if any. */
  parameters?: readonly PermissionParameter[] | undefined
  /** The command or the path the answer is about, if there is one. */
  command?: string | undefined
  /** The complete change the call would make, when the agent sent one. */
  diff?: ReactNode
  /** What the agent offers; the order it is given in is not the order it is shown in. */
  options: readonly PermissionOption[]
  /**
   * How long an "always" answer is remembered, said under the pointer on the standing answers: a
   * standing rule the reader cannot name is a rule they will be surprised by later.
   */
  scope?: string | undefined
  onDecide: (option: PermissionOption) => void
}

/** The risk an option carries, which is the order the buttons are read in. */
const RISK: Record<PermissionOptionKind, number> = {
  reject_once: 0,
  allow_once: 1,
  allow_always: 2,
  reject_always: 3,
}

/** What an option that carries no name of its own is called. */
const WORDS: Record<PermissionOptionKind, string> = {
  reject_once: 'Reject once',
  allow_once: 'Allow once',
  allow_always: 'Always allow',
  reject_always: 'Never allow',
}

/** The answers that outlive the request: a rule rather than a decision. */
const STANDING: readonly PermissionOptionKind[] = ['allow_always', 'reject_always']

export function PermissionRequest({
  toolName,
  label,
  subject,
  intent,
  parameters,
  command,
  diff,
  options,
  scope,
  onDecide,
}: PermissionRequestProps): ReactNode {
  const named = (option: PermissionOption): NoticeAnswerButton => ({
    label: `${option.name === '' ? WORDS[option.kind] : option.name}${
      STANDING.includes(option.kind) && scope !== undefined ? ` (${scope})` : ''
    }`,
    onPress: () => onDecide(option),
  })
  const refusal = options.find((option) => option.kind === 'reject_once')
  const once = options.find((option) => option.kind === 'allow_once')
  // Sorted rather than kept: the agent sends its options in its own order, and the reader reads
  // the standing ones by the risk they carry, between the refusal and the one-shot permission.
  const standing = options
    .filter((option) => STANDING.includes(option.kind))
    .toSorted((left, right) => RISK[left.kind] - RISK[right.kind])
  // What the call is, when it is not a line run once: the line a one-off runs is its own head.
  const what = toolName === 'commands_run' ? undefined : (label ?? toolName)
  const about = subject !== undefined && subject !== command ? subject : undefined
  const children =
    (label === undefined && intent !== undefined) || diff !== undefined ? (
      <>
        {label === undefined && intent !== undefined && <p className={INTENT}>{intent}</p>}
        {diff}
      </>
    ) : undefined
  return (
    <NoticeRow
      name={`Permission for ${label ?? toolName}`}
      mono={what === undefined}
      unfolds
      head={
        what === undefined ? (
          (command ?? toolName)
        ) : (
          <>
            <span className="font-medium">{what}</span>{' '}
            <span className={SUBJECT} title={about}>
              {about ?? command}
            </span>
          </>
        )
      }
      place={
        (parameters === undefined || parameters.length === 0) && about === undefined ? undefined : (
          <>
            <PermissionParameters parameters={parameters} />
            {/* The path as it resolves, when the text says it as the agent named it. */}
            {about !== undefined && command !== undefined && (
              <span className="font-mono">{command}</span>
            )}
          </>
        )
      }
      refuse={refusal === undefined ? undefined : named(refusal)}
      others={standing.map(named)}
      accept={once === undefined ? undefined : named(once)}
    >
      {children}
    </NoticeRow>
  )
}

/** The parameters that decide the answer, a label and its value each; a repository with its mark. */
export function PermissionParameters({
  parameters,
}: {
  parameters?: readonly PermissionParameter[] | undefined
}): ReactNode {
  if (parameters === undefined || parameters.length === 0) return null
  return (
    <dl className={PARAMETERS}>
      {parameters.map((parameter) => (
        <div key={parameter.label} className={PARAMETER}>
          <dt className={LABEL}>{parameter.label}</dt>
          {parameter.repository === undefined ? (
            <dd className={VALUE}>{parameter.value}</dd>
          ) : (
            <dd className={REPOSITORY_VALUE}>
              <RepositoryGlyph icon={parameter.repository.icon} />
              <span className="min-w-0 truncate">{parameter.value}</span>
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}

/** How a permission stands in the thread: still asked, allowed, refused, or left by a stop. */
export type PermissionStanding = 'pending' | 'allowed' | 'refused' | 'stopped'

const STANDINGS: Record<PermissionStanding, { answer: NoticeAnswer; word: string }> = {
  pending: { answer: 'pending', word: 'waiting' },
  allowed: { answer: 'accepted', word: 'allowed' },
  refused: { answer: 'refused', word: 'refused' },
  stopped: { answer: 'left', word: 'stopped' },
}

export interface PermissionRecordProps {
  /** The tool the agent asked for, as it names it: the line's words when there is no label. */
  toolName: string
  label?: string | undefined
  subject?: string | undefined
  parameters?: readonly PermissionParameter[] | undefined
  command?: string | undefined
  standing: PermissionStanding
  /** What was answered and when, once it was: the decision's own line. */
  decision?: { answer: string; at: string } | undefined
}

/**
 * A permission as the thread keeps it (issue #237): one closed line — the shield, a dot for how it
 * was answered, what the call is and what it is about — and, opened, where it would run, the whole
 * line, and the answer given. It is asked among the Session's notices, never here.
 */
export function PermissionRecord({
  toolName,
  label,
  subject,
  parameters,
  command,
  standing,
  decision,
}: PermissionRecordProps): ReactNode {
  const { answer, word } = STANDINGS[standing]
  return (
    <NoticeRecord
      icon={<IconShield size="sm" aria-hidden="true" />}
      answer={answer}
      answerLabel={word}
      label={label ?? toolName}
      subject={subject ?? command ?? ''}
      mono
      name={`Permission for ${label ?? toolName}, ${word}`}
    >
      <div className="flex flex-col gap-2">
        <PermissionParameters parameters={parameters} />
        {command !== undefined && <pre className={COMMAND}>{command}</pre>}
        {decision !== undefined && (
          <DecisionSummary
            answer={decision.answer}
            at={decision.at}
            refused={standing !== 'allowed'}
          />
        )}
      </div>
    </NoticeRecord>
  )
}
