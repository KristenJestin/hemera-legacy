import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Tabs, type TabsItem } from '../../components/tabs/tabs.tsx'
import {
  IconActivity,
  IconBook,
  IconBrain,
  IconClock,
  IconPlus,
  IconTerminal2,
} from '../../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import type { CommandLine } from '../../project/model.ts'
import type { GoingOnShell } from '../../session/going-on.ts'
import { ContextView } from '../../session/context-view.tsx'
import { PlanPanel, type PlanEntry } from '../../session/plan-panel.tsx'
import { type CatalogueActions, CatalogueRow, CatalogueRows } from './catalogue.tsx'
import type { Held } from './fixtures.ts'
import {
  CommandHistory,
  type HistoryActions,
  HistoryRun,
  HistoryShell,
  traceOf,
} from './history.tsx'
import { GROUP, type Rules } from './parts.tsx'

/**
 * The ⓘ Session details of the exploration: the dialog of today, its Activity and its Context, and
 * what points 8 and 10 of #237 add to it — the history of what the Session ran and the Project's
 * catalogue. Each variant lays them its own way (`Rules.catalogue`):
 *
 * - `section` · one Commands tab: the catalogue on top, the history under it.
 * - `tabs` · a History tab and a Catalogue tab, each for the one question.
 * - `grouped` · one Commands tab where each command of the catalogue carries its own runs under
 *   it, and the lines outside the catalogue follow under Other lines.
 */

export type DetailsTab = 'activity' | 'commands' | 'history' | 'catalogue' | 'context'

const PLAN: PlanEntry[] = [
  { content: 'Stream the invoices into the CSV', priority: 'high', status: 'completed' },
  { content: 'Write the currency of each row', priority: 'high', status: 'in_progress' },
  { content: 'Check the export in the browser', priority: 'medium', status: 'pending' },
]

const SECTION = 'flex flex-col gap-1'

const GROUPED = 'ml-4 flex flex-col gap-0.5 border-l border-border pl-3'

/** A tab's panel, faded in as it is chosen, as the real details do. */
function Crossfaded({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(crossfade)
  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={CROSSFADE.from}
      animate={CROSSFADE.to}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

export interface QuietDetailsProps {
  rules: Rules
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: DetailsTab
  onTabChange: (tab: DetailsTab) => void
  runs: readonly Held[]
  shells: readonly GoingOnShell[]
  catalogue: readonly CommandLine[]
  running: readonly string[]
  history: HistoryActions
  actions: CatalogueActions
  onEdit: (entry: CommandLine | null) => void
}

export function QuietDetails({
  rules,
  open,
  onOpenChange,
  tab,
  onTabChange,
  runs,
  shells,
  catalogue,
  running,
  history,
  actions,
  onEdit,
}: QuietDetailsProps): ReactNode {
  const trace = traceOf(runs, shells)
  const rows = (
    <CatalogueRows catalogue={catalogue} running={running} actions={actions} onEdit={onEdit} />
  )
  const list = <CommandHistory trace={trace} actions={history} />

  const activity: TabsItem<DetailsTab> = {
    value: 'activity',
    label: 'Activity',
    icon: <IconActivity size="sm" />,
    panel: (
      <Crossfaded>
        <PlanPanel entries={PLAN} />
      </Crossfaded>
    ),
  }
  const context: TabsItem<DetailsTab> = {
    value: 'context',
    label: 'Context',
    icon: <IconBrain size="sm" />,
    panel: (
      <Crossfaded>
        <ContextView
          workspace={{ name: 'csv-export', path: '~/atlas/.hemera/csv-export' }}
          instructions={[{ label: 'AGENTS.md', detail: 'given at the start of the Session' }]}
          tools={[{ name: 'commands_run', bound: 'the catalogue, and one-offs you allow' }]}
          commands={catalogue.map((entry) => ({ name: entry.name, command: entry.command }))}
        />
      </Crossfaded>
    ),
  }

  let middle: TabsItem<DetailsTab>[]
  if (rules.catalogue === 'section') {
    middle = [
      {
        value: 'commands',
        label: 'Commands',
        icon: <IconTerminal2 size="sm" />,
        panel: (
          <Crossfaded>
            <section aria-label="Catalogue" className={SECTION}>
              <p className={GROUP}>Catalogue</p>
              {rows}
            </section>
            <section aria-label="History" className={SECTION}>
              <p className={GROUP}>History</p>
              {list}
            </section>
          </Crossfaded>
        ),
      },
    ]
  } else if (rules.catalogue === 'tabs') {
    middle = [
      {
        value: 'history',
        label: 'History',
        icon: <IconClock size="sm" />,
        panel: <Crossfaded>{list}</Crossfaded>,
      },
      {
        value: 'catalogue',
        label: 'Catalogue',
        icon: <IconBook size="sm" />,
        panel: <Crossfaded>{rows}</Crossfaded>,
      },
    ]
  } else {
    const others = traceOf(
      runs.filter(({ run }) => !catalogue.some((entry) => entry.name === run.name)),
      shells,
    )
    middle = [
      {
        value: 'commands',
        label: 'Commands',
        icon: <IconTerminal2 size="sm" />,
        panel: (
          <Crossfaded>
            <ul aria-label="The catalogue and its runs" className="flex flex-col gap-2">
              {catalogue.map((entry) => {
                const own = runs.filter(({ run }) => run.name === entry.name)
                return (
                  <li key={entry.id} className="flex flex-col gap-0.5">
                    <CatalogueRow
                      entry={entry}
                      running={running.includes(entry.name)}
                      actions={actions}
                      onEdit={onEdit}
                    />
                    {own.length > 0 && (
                      <ol aria-label={`Runs of ${entry.name}`} className={GROUPED}>
                        {own.map(({ run }) => (
                          <li key={run.id}>
                            <HistoryRun run={run} actions={history} bare />
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="flex">
              <Button variant="ghost" size="sm" onClick={() => onEdit(null)}>
                <IconPlus size="sm" />
                Add a command
              </Button>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className={GROUP}>Other lines</p>
              <ol aria-label="Other lines" className="flex flex-col gap-0.5">
                {others.map((one) => (
                  <li key={one.kind === 'run' ? one.held.run.id : one.shell.id}>
                    {one.kind === 'run' ? (
                      <HistoryRun run={one.held.run} actions={history} />
                    ) : (
                      <HistoryShell shell={one.shell} />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </Crossfaded>
        ),
      },
    ]
  }

  return (
    <Dialog title="Session details" size="wide" open={open} onOpenChange={onOpenChange}>
      <Tabs
        label="What this Session is doing"
        value={tab}
        onValueChange={onTabChange}
        items={[activity, ...middle, context]}
      />
    </Dialog>
  )
}
