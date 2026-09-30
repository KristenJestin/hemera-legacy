/**
 * The end-to-end run with no window on screen (issue #67).
 *
 * The same suite as `wdio.conf.ts`, with `HEMERA_E2E_HEADLESS=1` set on the launcher: the
 * workers, the driver and the application it starts inherit it from there, so the window opens
 * off screen and nothing takes the focus of whoever is using the machine. Set here rather
 * than on the command line, because `VAR=1 command` is not something every shell understands.
 *
 * On Linux, outside CI, an off-screen position means nothing to a Wayland compositor, which
 * places windows itself: the run starts a headless weston before the first worker and stops it
 * after the last, and the workers inherit its socket the way they inherit the variable
 * (`e2e/compositor.ts`). It also starts and ends on a temporary directory with nothing of a
 * suite left in it. Elsewhere the run is the one it always was.
 *
 *   pnpm --filter @hemera/desktop e2e:headless
 */

import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compositorOf, inCompositor, startCompositor } from './e2e/compositor.ts'
import { HEADLESS_VARIABLE } from './src/main/window-options.ts'
import { config as suite } from './wdio.conf.ts'

process.env[HEADLESS_VARIABLE] = '1'

const compositor = compositorOf(process.platform, process.env)
let stopCompositor: (() => Promise<void>) | null = null

/**
 * Removes every folder and file the suite left in the temporary directory, the agent's and the
 * Workspaces' included, which `wdio.conf.ts` keeps because Windows will not let a folder go while
 * a process sits in it. Nothing holds them on Linux, and a run that starts on the repositories,
 * branches and signal files of the last one is not the run it claims to be.
 */
function removeLeftovers(): void {
  for (const entry of readdirSync(tmpdir())) {
    if (entry.startsWith('hemera-e2e-')) {
      rmSync(join(tmpdir(), entry), { recursive: true, force: true })
    }
  }
}

/** Starts the compositor, and ends the run where it cannot: nothing may open on the desktop. */
async function openCompositor(command: readonly string[]): Promise<void> {
  removeLeftovers()
  // Pointed at the compositor before it is started, so a window can never reach the desktop.
  delete process.env.DISPLAY
  Object.assign(process.env, inCompositor(process.env))
  try {
    stopCompositor = await startCompositor(command)
  } catch (error) {
    console.error(error)
    // A hook's error is only logged by the launcher, which would go on with no display at all.
    process.exit(1)
  }
}

async function closeCompositor(): Promise<void> {
  await stopCompositor?.()
  removeLeftovers()
}

// The launcher runs every hook of a list, the suite's own and these; workers never run them.
export const config: WebdriverIO.Config = {
  ...suite,
  onPrepare: [
    ...[suite.onPrepare ?? []].flat(),
    ...(compositor ? [async () => await openCompositor(compositor)] : []),
  ],
  onComplete: [...[suite.onComplete ?? []].flat(), ...(compositor ? [closeCompositor] : [])],
}
