// Temporary (#253): samples how busy the runner's processors are, every two seconds, until killed.
import { cpus } from 'node:os'
import { appendFileSync } from 'node:fs'

const out = process.argv[2]
let last = cpus().map((cpu) => cpu.times)
setInterval(() => {
  const now = cpus().map((cpu) => cpu.times)
  let busy = 0
  let total = 0
  now.forEach((times, index) => {
    const before = last[index]
    const all = Object.keys(times).reduce((sum, key) => sum + times[key] - before[key], 0)
    total += all
    busy += all - (times.idle - before.idle)
  })
  last = now
  appendFileSync(out, `${new Date().toISOString()} ${((100 * busy) / total).toFixed(0)}\n`)
}, 2000)
