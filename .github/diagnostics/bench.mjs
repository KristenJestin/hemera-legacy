// Temporary (#253): what one git, one spawn and one tree kill cost on this runner.
import { execFileSync, spawn, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, cpus, freemem, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'

const windows = process.platform === 'win32'
const rounds = Number(process.argv[2] ?? 15)
const results = {}
const time = (name, run) => {
  const started = performance.now()
  run()
  ;(results[name] ??= []).push(performance.now() - started)
}
const timeAsync = async (name, run) => {
  const started = performance.now()
  await run()
  ;(results[name] ??= []).push(performance.now() - started)
}
const git = (cwd, ...args) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      stdio: 'ignore',
    },
  )

console.log(
  `cpus ${cpus().length} parallelism ${availableParallelism()} memory ${(totalmem() / 2 ** 30).toFixed(1)} GiB free ${(freemem() / 2 ** 30).toFixed(1)} GiB`,
)
const root = mkdtempSync(join(tmpdir(), 'hemera-bench-'))
for (let round = 0; round < rounds; round += 1) {
  const repo = join(root, `r${round}`)
  mkdirSync(repo)
  time('git init', () => git(repo, 'init', '-q', '-b', 'main'))
  time('git commit', () => git(repo, 'commit', '-q', '--allow-empty', '-m', 'base'))
  time('git status', () => git(repo, 'status', '--porcelain'))
  time('git worktree add', () =>
    git(repo, 'worktree', 'add', '-q', '-b', `b${round}`, join(root, `w${round}`)),
  )
  time('git worktree remove', () =>
    git(repo, 'worktree', 'remove', '--force', join(root, `w${round}`)),
  )
  time('node -e 0', () => execFileSync(process.execPath, ['-e', '0']))
  if (windows)
    time('cmd /c exit', () =>
      execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'exit 0']),
    )
  else time('sh -c true', () => execFileSync('sh', ['-c', 'true']))
  await timeAsync('spawn+kill tree', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: !windows,
    })
    await new Promise((resolve) => child.once('spawn', resolve))
    const exited = new Promise((resolve) => child.once('exit', resolve))
    if (windows)
      await new Promise((resolve) =>
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], resolve),
      )
    else process.kill(-child.pid, 'SIGKILL')
    await exited
  })
  const files = join(root, `f${round}`)
  mkdirSync(files)
  for (let file = 0; file < 200; file += 1) writeFileSync(join(files, `${file}.txt`), 'x')
  time('rm 200 files', () => rmSync(files, { recursive: true, force: true }))
  time('rm repo', () => rmSync(repo, { recursive: true, force: true }))
}
rmSync(root, { recursive: true, force: true, maxRetries: 10 })
for (const [name, values] of Object.entries(results)) {
  values.sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)]
  const p90 = values[Math.floor(values.length * 0.9)]
  console.log(
    `${name.padEnd(22)} median ${median.toFixed(0).padStart(5)} ms  p90 ${p90.toFixed(0).padStart(5)} ms`,
  )
}
