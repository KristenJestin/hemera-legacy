// Temporary (#253): every child process a test file starts, with its program and its lifetime,
// and, for a test still running after fifteen seconds, what it is waiting on.
import childProcess, { ChildProcess } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { basename, join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import { afterEach, beforeEach, expect } from 'vite-plus/test'

const folder = process.env['HEMERA_SPAWN_TRACE']
if (folder !== undefined && folder !== '') {
  const out = join(folder, `spawns-${process.pid}.jsonl`)
  const where = () => {
    const state = expect.getState()
    return { file: basename(state.testPath ?? ''), test: state.currentTestName ?? '' }
  }
  const write = (entry: object) => appendFileSync(out, `${JSON.stringify(entry)}\n`)
  const shown = (args: readonly unknown[]) =>
    args.filter((arg, index) => arg !== '-c' && args[index - 1] !== '-c').slice(0, 4)
  const live = new Map<ChildProcess, { program: string; args: unknown[]; started: number; test: string; exited?: number }>()
  const original = ChildProcess.prototype.spawn
  ChildProcess.prototype.spawn = function (this: ChildProcess, options: { file: string; args: string[] }) {
    const started = performance.now()
    const at = where()
    const entry = { program: basename(options.file), args: shown(options.args.slice(1)), started, test: at.test }
    live.set(this, entry)
    const result = original.call(this, options)
    const spawnedIn = Math.round(performance.now() - started)
    this.once('exit', (code, signal) => {
      entry.exited = performance.now()
      write({ ...at, kind: 'exit', program: entry.program, args: entry.args, spawnMs: spawnedIn, ms: Math.round(entry.exited - started), code, signal })
    })
    this.once('close', () => {
      live.delete(this)
      const closed = performance.now()
      if (entry.exited !== undefined && closed - entry.exited > 500)
        write({ ...at, kind: 'late-close', program: entry.program, args: entry.args, ms: Math.round(closed - entry.exited) })
    })
    return result
  } as typeof original
  for (const name of ['execFileSync', 'spawnSync', 'execSync'] as const) {
    const wrapped = childProcess[name] as (...args: unknown[]) => unknown
    ;(childProcess as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const started = performance.now()
      const at = where()
      try {
        return wrapped(...args)
      } finally {
        write({ ...at, kind: 'sync', program: basename(String(args[0])), args: Array.isArray(args[1]) ? shown(args[1]) : [], ms: Math.round(performance.now() - started) })
      }
    }
  }
  syncBuiltinESMExports()

  const delay = monitorEventLoopDelay({ resolution: 20 })
  delay.enable()
  let testStarted = 0
  let snapshots = 0
  const snapshot = (reason: string) => {
    const now = performance.now()
    const resources: Record<string, number> = {}
    for (const one of process.getActiveResourcesInfo()) resources[one] = (resources[one] ?? 0) + 1
    write({
      ...where(),
      kind: 'snapshot',
      reason,
      testMs: Math.round(now - testStarted),
      loopMaxMs: Math.round(delay.max / 1e6),
      loopP99Ms: Math.round(delay.percentile(99) / 1e6),
      children: [...live.values()].map((one) => ({
        program: one.program,
        args: one.args,
        ageMs: Math.round(now - one.started),
        exitedMsAgo: one.exited === undefined ? null : Math.round(now - one.exited),
        test: one.test === where().test ? 'this' : one.test,
      })),
      resources,
    })
  }
  const watchdog = setInterval(() => {
    if (testStarted === 0) return
    const running = performance.now() - testStarted
    if (running > 15_000 && snapshots < 4) {
      snapshots += 1
      snapshot('running')
    }
  }, 5_000)
  watchdog.unref()
  beforeEach(() => {
    testStarted = performance.now()
    snapshots = 0
    delay.reset()
  })
  afterEach((context) => {
    const took = performance.now() - testStarted
    if (took > 10_000 || context.task.result?.state === 'fail') snapshot('ended')
    testStarted = 0
  })
}
