/**
 * The commands a Project runs each time Hemera opens (#114).
 *
 * A command of the catalogue marked "Run when Hemera opens" is run once per Project, in its `main`
 * Workspace, whatever its type: a script that ends, as `docker compose up -d`, as much as a
 * service that stays. It is run through the very `run` the user's panel and the agent's tool go
 * through, with no Session, so its run is written, shown and journalled as any other — red when
 * it fails. A run of it still going in `main`, which this engine still sees as its own, is stopped
 * first and started again, so it starts clean: a `serve` would otherwise be joined, not restarted.
 *
 * The main process asks for it once the window is shown, never before: opening is not slowed
 * down. Nothing here stops Hemera from opening: a command that cannot be started is said in the
 * answer, for the diagnostic log, and the next one is run all the same.
 */

import { Effect } from 'effect'

import { Projects } from '../projects.ts'
import { Sessions } from '../sessions.ts'
import { Variables } from '../workspaces/variables.ts'
import { Commands, commandCwd } from './service.ts'

/**
 * Runs every command marked to run when Hemera opens, in its Project's `main`, and answers what
 * could not be started — one sentence each, naming the command and its Project. An archived
 * Project runs nothing.
 */
export const runAtOpen = Effect.gen(function* () {
  const projects = yield* Projects
  const sessions = yield* Sessions
  const commands = yield* Commands
  const variables = yield* Variables
  const refused: string[] = []
  for (const project of yield* projects.list(false)) {
    const marked = (yield* commands.list(project.id)).filter((one) => one.runAtOpen)
    for (const entry of marked) {
      yield* Effect.gen(function* () {
        const main = yield* sessions.mainOf(project.id)
        const { folder, cwd } = yield* commandCwd(main.path, entry)
        // What is still going of it in `main` is stopped first: it starts clean.
        for (const run of yield* commands.runningIn(null, project.id)) {
          if (run.commandId === entry.id) yield* commands.stopIn(project.id, run.id)
        }
        yield* commands.run({
          sessionId: null,
          projectId: project.id,
          commandId: entry.id,
          name: entry.name,
          line: entry.line,
          lineWindows: entry.lineWindows,
          lineLinux: entry.lineLinux,
          type: entry.type,
          scope: entry.scope,
          portless: entry.portless,
          portlessName: entry.portlessName,
          folder,
          cwd,
          workspaceId: main.id,
          workspaceName: main.name,
          environment: yield* variables.givenFor(project.id, main.id),
          startedBy: 'user',
        })
      }).pipe(
        Effect.catch((cause) =>
          Effect.sync(() => {
            refused.push(`${project.name}: ${entry.name} was not run at open: ${cause.message}`)
          }),
        ),
      )
    }
  }
  return refused
})
