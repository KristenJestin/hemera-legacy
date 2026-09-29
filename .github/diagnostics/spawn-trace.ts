// Temporary (#253): every child process a test file starts, with its program and its lifetime.
import childProcess, { ChildProcess } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { basename, join } from 'node:path'

import { expect } from 'vite-plus/test'

const folder = process.env['HEMERA_SPAWN_TRACE']
if (folder !== undefined && folder !== '') {
  const out = join(folder, `spawns-${process.pid}.jsonl`)
  const where = () => {
    const state = expect.getState()
    return { file: state.testPath ?? '', test: state.currentTestName ?? '' }
  }
  const shown = (args: readonly unknown[]) =>
    args.filter((arg, index) => arg !== '-c' && args[index - 1] !== '-c').slice(0, 3)
  const write = (entry: object) => appendFileSync(out, `${JSON.stringify(entry)}\n`)
  const original = ChildProcess.prototype.spawn
  ChildProcess.prototype.spawn = function (
    this: ChildProcess,
    options: { file: string; args: string[] },
  ) {
    const started = performance.now()
    const at = where()
    const result = original.call(this, options)
    this.once('exit', () =>
      write({
        ...at,
        sync: false,
        program: basename(options.file),
        args: shown(options.args.slice(1)),
        ms: Math.round(performance.now() - started),
      }),
    )
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
        write({
          ...at,
          sync: true,
          program: basename(String(args[0])),
          args: Array.isArray(args[1]) ? shown(args[1]) : [],
          ms: Math.round(performance.now() - started),
        })
      }
    }
  }
  syncBuiltinESMExports()
}
