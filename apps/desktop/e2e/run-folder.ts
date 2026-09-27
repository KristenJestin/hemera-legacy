/**
 * The temporary folder of one run of the suite, in which every folder the suite makes is made.
 *
 * Not a spec file. The suite's folders are named rather than drawn at random — the data folder
 * of a spec file, the stand-in agent, a Project's sources — because the launcher and every worker
 * have to find the same one. Named in the system's temporary folder, they were shared by every
 * run on the machine: two checkouts running the suite at once removed and rewrote each other's,
 * and a run failed on a Workspace the other one had made. So for the length of a run the system's
 * temporary folder is a folder of that run's own, made once by the launcher and handed through
 * the environment to the workers, the driver and the application, which all read it from there.
 *
 * Imported before anything that asks for the temporary folder, which is why `wdio.conf.ts`
 * imports it first.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Where the launcher tells its workers which folder the run is in. */
const VARIABLE = 'HEMERA_E2E_TEMP'

const system = tmpdir()

// The driver the service fetches is the machine's and not the run's: it stays where it was, and
// is fetched once rather than once a run.
process.env.WEBDRIVER_CACHE_DIR ??= system

/** The run's temporary folder: made by the launcher, found again by everything it starts. */
export const RUN_FOLDER = process.env[VARIABLE] ?? mkdtempSync(join(system, 'hemera-e2e-run-'))

process.env[VARIABLE] = RUN_FOLDER
for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = RUN_FOLDER
