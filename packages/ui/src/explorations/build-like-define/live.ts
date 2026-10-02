import { useEffect, useState } from 'react'

import type { BuildTaskState } from '../../build/model.ts'
import type { CommandState } from '../../activity/command-run.tsx'
import { GOING_ON } from '../../session/going-on-fixtures.ts'
import type { GoingOnRun } from '../../session/going-on.ts'
import type { LiveRun } from './run-chips.tsx'
import { BOARD, type BoardTask } from './tasks-fixtures.ts'

/**
 * The build as it goes on, for the Playground: a beat every few seconds moves one task or one
 * run on, so the marks and the chips can be watched changing in place — a check finishing, the
 * tests failing, a task starting, a try going green — and then everything starts over. Off, the
 * build stands still, as every story but the Playground wants it.
 *
 * What the reader does to a run — stop it, run it again — is theirs and is kept.
 */

/** How long a beat of the script lasts, in milliseconds. */
const BEAT = 2600

type Beat =
  | { task: string; state: BuildTaskState }
  | { run: string; state: CommandState }
  | { reset: true }

const SCRIPT: readonly Beat[] = [
  { task: 'T4', state: 'done' },
  { run: 'run-test', state: 'failed' },
  { task: 'T8', state: 'in_progress' },
  { task: 'T2', state: 'checking' },
  { run: 'run-test', state: 'running' },
  { task: 'T2', state: 'done' },
  { run: 'run-test', state: 'finished' },
  { task: 'T9', state: 'ready' },
  { task: 'T5', state: 'ready' },
  { reset: true },
]

/** The runs of the Session: its dev server, running for a while, and its tests, just started. */
function runsAtStart(): LiveRun[] {
  const now = Date.now()
  const runs = GOING_ON.few.flatMap((item) => (item.kind === 'run' ? [item] : []))
  return runs.map((item, index) => ({
    item,
    startedAt: now - (index === 0 ? 9 * 60_000 : 40_000),
    endedAt: null,
  }))
}

function withTaskState(task: BoardTask, state: BuildTaskState): BoardTask {
  return { ...task, state }
}

function withRunState(item: GoingOnRun, state: CommandState): GoingOnRun {
  return { ...item, state }
}

export interface LiveSession {
  tasks: readonly BoardTask[]
  runs: readonly LiveRun[]
  stop: (id: string) => void
  retry: (id: string) => void
}

export function useLiveSession(live: boolean): LiveSession {
  const [tasks, setTasks] = useState<readonly BoardTask[]>(BOARD)
  const [runs, setRuns] = useState<readonly LiveRun[]>(runsAtStart)
  const [beat, setBeat] = useState(0)

  function setRun(id: string, state: CommandState, only?: CommandState): void {
    const now = Date.now()
    setRuns((all) =>
      all.map((run) =>
        run.item.id !== id || (only !== undefined && run.item.state !== only)
          ? run
          : {
              item: withRunState(run.item, state),
              startedAt: state === 'running' ? now : run.startedAt,
              endedAt: state === 'running' ? null : now,
            },
      ),
    )
  }

  useEffect(() => {
    if (!live) return
    const tick = setInterval(() => setBeat((one) => one + 1), BEAT)
    return () => clearInterval(tick)
  }, [live])

  useEffect(() => {
    if (beat === 0) return
    const step = SCRIPT[(beat - 1) % SCRIPT.length]
    if (step === undefined) return
    if ('reset' in step) {
      setTasks(BOARD)
      setRuns(runsAtStart())
      return
    }
    if ('task' in step) {
      setTasks((all) =>
        all.map((task) => (task.label === step.task ? withTaskState(task, step.state) : task)),
      )
      return
    }
    // The script runs the tests again once they failed, and ends them only while they run.
    setRun(step.run, step.state, step.state === 'running' ? 'failed' : 'running')
  }, [beat])

  return {
    tasks,
    runs,
    stop: (id) => setRun(id, 'stopped'),
    retry: (id) => setRun(id, 'running'),
  }
}
