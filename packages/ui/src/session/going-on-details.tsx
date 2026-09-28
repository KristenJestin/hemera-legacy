import type { ReactNode } from 'react'

import { COMMAND_TYPE_ICONS, COMMAND_TYPE_LABELS } from '../activity/command-type.ts'
import { TerminalOutput } from '../activity/terminal-output.tsx'
import { Button } from '../components/button/button.tsx'
import { Dialog } from '../components/dialog/dialog.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus, IconPlayerStop } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { ServiceUrl } from '../workspace/service-list.tsx'
import { RepositoryGlyph } from './run-place.tsx'
import {
  type GoingOnItem,
  type GoingOnRun,
  type GoingOnShell,
  type GoingOnState,
  goingOnStateOf,
} from './going-on.ts'

/**
 * Everything about one thing that goes on in a Session, laid the same way whatever its kind
 * (issue #219): a grid of facts in the same order and words, then what it printed — or, for a
 * sub-agent, its steps and what it last said.
 *
 * No badge. Whose it is, is a fact (Started); how it stands is the line's own dot, with beside it
 * only what the dot cannot say — since when it runs, what it exited with, how far a sub-agent got.
 * What a run's type adds joins the same grid: its type, a server's address, and that a one-off is
 * not in the catalogue, which the footer then offers to keep there.
 */

export const GOING_ON_TONES: Record<GoingOnState, StatusTone> = {
  running: 'running',
  finished: 'success',
  failed: 'failure',
}

export const GOING_ON_WORDS: Record<GoingOnState, string> = {
  running: 'running',
  finished: 'done',
  failed: 'failed',
}

const FACTS = 'grid grid-cols-2 gap-x-4 gap-y-3 text-sm'

const FACT = 'flex min-w-0 flex-col gap-0.5'

const FACT_WIDE = 'col-span-2 flex min-w-0 flex-col gap-0.5'

const TERM = 'text-xs text-muted-foreground'

const VALUE = 'min-w-0 break-words'

const MONO_VALUE = 'min-w-0 font-mono break-all'

const ICON = 'flex shrink-0 text-muted-foreground'

const NOTE = 'text-xs text-muted-foreground'

/** One fact: what it is called, and what it says. */
interface Fact {
  term: string
  value: ReactNode
  /** Whether it is a line or a path, set in the terminal's letters. */
  mono?: boolean | undefined
  /** Whether it takes the whole width, for a sentence rather than a value. */
  wide?: boolean | undefined
}

/** What stands beside the dot: since when it runs, what it exited with, how far it got. */
function besideOf(item: GoingOnItem): string {
  if (item.kind === 'agent') return `${String(item.steps.length)} steps`
  if (goingOnStateOf(item) === 'running') return `since ${item.at}`
  return item.exitCode === undefined ? 'over' : `exit ${String(item.exitCode)}`
}

function StateFact({ item }: { item: GoingOnItem }): ReactNode {
  const state = goingOnStateOf(item)
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot status={GOING_ON_TONES[state]} size="sm" label={GOING_ON_WORDS[state]} />
      {besideOf(item)}
    </span>
  )
}

/** What a run's type says: its icon and word, or that it is a line the catalogue lacks. */
function TypeFact({ run }: { run: GoingOnRun }): ReactNode {
  if (run.oneOff === true) return 'One-off, not in the catalogue'
  const TypeIcon = COMMAND_TYPE_ICONS[run.type]
  return (
    <span className="flex items-center gap-1.5">
      <span className={ICON}>
        <TypeIcon size="sm" aria-hidden="true" />
      </span>
      {COMMAND_TYPE_LABELS[run.type]}
    </span>
  )
}

/** Every kind's facts, in the same order and the same words wherever they apply. */
function factsOf(item: GoingOnItem, onOpenUrl: (url: string) => void): Fact[] {
  const state: Fact = { term: 'State', value: <StateFact item={item} /> }
  if (item.kind === 'agent') {
    return [
      { term: 'Task', value: item.task, wide: true },
      { term: 'Started', value: `${item.at}, by the agent` },
      state,
    ]
  }
  if (item.kind === 'shell') {
    return [
      { term: 'Line', value: item.command, mono: true },
      { term: 'Folder', value: item.folder, mono: true },
      { term: 'Workspace', value: item.workspace },
      { term: 'Started', value: `${item.at}, by the agent in its own shell` },
      state,
    ]
  }
  const variables = Object.entries(item.environment).map(([key, value]) => `${key}=${value}`)
  const serving = item.url !== undefined && item.state === 'running'
  const address: Fact[] =
    serving && item.url !== undefined
      ? [
          {
            term: 'Address',
            value: <ServiceUrl url={item.url} readiness={item.readiness} onOpenUrl={onOpenUrl} />,
          },
        ]
      : []
  // A run in one of the Project's repositories is said as that repository, with its mark, and the
  // folder under it only when it is not the repository itself (issue #239).
  const place: Fact[] =
    item.repository === undefined
      ? [{ term: 'Folder', value: item.folder, mono: true }]
      : [
          {
            term: 'Repository',
            value: (
              <span className="flex items-center gap-1.5">
                <RepositoryGlyph icon={item.repository.icon} />
                {item.repository.path}
              </span>
            ),
            mono: true,
          },
          ...(item.folder === '.' ? [] : [{ term: 'Folder', value: item.folder, mono: true }]),
        ]
  return [
    { term: 'Line', value: item.command, mono: true },
    { term: 'Type', value: <TypeFact run={item} /> },
    ...address,
    ...place,
    { term: 'Workspace', value: item.workspace },
    {
      term: 'Started',
      value: `${item.at}, by ${item.startedBy === 'agent' ? 'the agent' : 'you'} through Hemera`,
    },
    state,
    {
      term: 'Variables',
      value: variables.length === 0 ? 'None beyond the machine’s' : variables.join(' '),
      mono: variables.length > 0,
    },
  ]
}

/** What a command printed, or that it has printed nothing yet. */
export function GoingOnOutput({ item }: { item: GoingOnRun | GoingOnShell }): ReactNode {
  if (item.output === '') return <p className={NOTE}>Nothing printed yet.</p>
  return (
    <TerminalOutput
      plain
      terminalId={item.id}
      output={item.output}
      released={goingOnStateOf(item) !== 'running'}
    />
  )
}

/** The dialog's title, and a line under it only where the facts cannot say it. */
interface Heading {
  title: string
  description?: string | undefined
}

function headingOf(item: GoingOnItem): Heading {
  if (item.kind === 'run') return { title: item.name }
  if (item.kind === 'agent') return { title: `Sub-agent · ${item.name}` }
  return {
    title: item.command,
    description: 'Hemera shows what the agent’s tool reported, and holds no process it could stop.',
  }
}

export interface GoingOnDetailsProps {
  item: GoingOnItem
  onClose: () => void
  onStop: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onAddToCatalogue: (run: GoingOnRun) => void
}

export function GoingOnDetails({
  item,
  onClose,
  onStop,
  onOpenUrl,
  onAddToCatalogue,
}: GoingOnDetailsProps): ReactNode {
  return (
    <Dialog
      size="wide"
      {...headingOf(item)}
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      actions={
        item.kind === 'run' ? (
          <>
            {item.oneOff === true && (
              <Button variant="ghost" onClick={() => onAddToCatalogue(item)}>
                <IconBookmarkPlus size="sm" aria-hidden="true" />
                Add to catalogue
              </Button>
            )}
            {item.state === 'running' && (
              <Button variant="secondary" onClick={() => onStop(item)}>
                <IconPlayerStop size="sm" aria-hidden="true" />
                Stop
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <dl className={FACTS}>
          {factsOf(item, onOpenUrl).map((fact) => (
            <div key={fact.term} className={fact.wide === true ? FACT_WIDE : FACT}>
              <dt className={TERM}>{fact.term}</dt>
              <dd className={fact.mono === true ? MONO_VALUE : VALUE}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {item.kind === 'agent' ? (
          <>
            <div className="flex flex-col gap-1">
              <p className={TERM}>Steps</p>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-1">
              <p className={TERM}>Last said</p>
              <AgentText text={item.last} />
            </div>
          </>
        ) : (
          <GoingOnOutput item={item} />
        )}
      </div>
    </Dialog>
  )
}
