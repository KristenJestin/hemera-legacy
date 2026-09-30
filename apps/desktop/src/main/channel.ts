/**
 * Which build this is, and which folders it therefore opens (design D3-06, #262).
 *
 * The channel is engraved in the manifest of a package when the package is built, and read
 * from there and nowhere else: no environment variable and no argument can talk a package into
 * being another channel. An application that is not a package is `dev`, which is the channel a
 * development run, a test and an agent all get.
 *
 * Two folders per start. Hemera's data — the database, its backups, the log, the Workspaces —
 * lives in a dot-folder of the home, and Electron's own profile — Chromium's caches and storage,
 * and the single-instance lock — lives apart, in the system's data folder. `prod` and `beta`
 * share both on purpose: the beta is the application the user runs every day, on real data, only
 * one of the two is installed at a time, and a shared profile is what keeps them from running
 * together. `dev` has its own of each, one per checkout of the repository. A `dev` build may be
 * pointed at a throwaway folder instead, which then holds its profile too; it may not be pointed
 * at the real one.
 *
 * Everything here that decides is pure and takes what it reads as arguments, so the rules can
 * be checked on every platform from one machine, without Electron and without a data folder.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix, win32 } from 'node:path'

import { type Channel, channelSchema } from '@hemera/ipc'

/** The data folder of `prod` and `beta`, in the home. */
export const DATA_FOLDER = '.hemera'

/** The folder beside it that holds the data folders of `dev`, one per checkout. */
export const DEV_DATA_FOLDER = '.hemera-dev'

/** Electron's profile of `prod` and `beta`, in the system's data folder. */
export const PROFILE_FOLDER = 'hemera'

/** The folder beside it that holds the profiles of `dev`, one per checkout. */
export const DEV_PROFILE_FOLDER = 'hemera-dev'

/** Where the profile goes inside a folder a `dev` build was pointed at. */
export const ARGUMENT_PROFILE = 'profile'

/** The checkout a `dev` run is from when it is the main working tree, or no checkout at all. */
export const MAIN_CHECKOUT = 'root'

/** The flag a `dev` build accepts so a test or a trial gets a data folder of its own. */
export const DATA_DIRECTORY_FLAG = '--data-dir'

/** Set by the development run to the label `git describe` gave the working tree. */
export const VERSION_VARIABLE = 'HEMERA_VERSION'

/**
 * What this running application is, read from the manifest it was loaded from.
 *
 * Both answers Electron has to give are taken as arguments rather than asked of Electron here,
 * so the rule can be checked from a plain Node test; the main process passes `app.isPackaged`
 * and `app.getAppPath()`. A manifest that names no channel is read as `dev`, which is the safe
 * direction: a package cannot become `prod` by forgetting to say what it is.
 */
export function channel(packaged: boolean, applicationPath: string): Channel {
  if (!packaged) return 'dev'
  const manifest = readFileSync(join(applicationPath, 'package.json'), 'utf8')
  // SAFETY: the manifest Electron loaded the application from, read for one field whose value
  // is then validated by the schema; JSON.parse answers untyped by definition.
  const carried = (JSON.parse(manifest) as { hemera?: { channel?: string } }).hemera?.channel
  const read = channelSchema.safeParse(carried)
  return read.success ? read.data : 'dev'
}

/** What a build says it is, resolved once at start-up and carried wherever it is reported. */
export interface ApplicationIdentity {
  version: string
  channel: Channel
}

/**
 * What this build calls itself.
 *
 * A package carries its version in the manifest it was built with, and that is the only thing
 * it answers — an environment variable does not get to rename a package. A development run has
 * no version of its own to carry, so the run hands it the label the repository answers.
 *
 * That label is a tag, and a tag is written `v0.3.0`; a version is not. It is stripped here,
 * which is the one place a version is decided, so a development run and a package report the
 * same thing rather than differing by a letter nobody meant to ship.
 */
export function applicationVersion(
  packaged: boolean,
  manifestVersion: string,
  environment: Record<string, string | undefined>,
): string {
  if (packaged) return manifestVersion
  const described = named(environment[VERSION_VARIABLE])
  return described === null ? manifestVersion : described.replace(/^v/, '')
}

/** The separators of the platform asked about, not of the machine asking. */
function pathOf(platform: string): typeof posix {
  return platform === 'win32' ? win32 : posix
}

/**
 * Where Hemera's data lives for a channel: `~/.hemera` for `prod` and `beta`, and
 * `~/.hemera-dev/<checkout>` for `dev`, so two development runs from two worktrees never share
 * a database. The home is the one the platform names, `%USERPROFILE%` on Windows.
 */
export function dataDirectory(
  engraved: Channel,
  platform: string,
  environment: Record<string, string | undefined>,
  checkout: string = MAIN_CHECKOUT,
): string {
  // The separators of the platform asked about: the rule is checked for Windows and for Linux
  // from whichever of the two the suite happens to run on.
  const path = pathOf(platform)
  const home = homeDirectory(platform, environment)
  return engraved === 'dev'
    ? path.join(home, DEV_DATA_FOLDER, checkout)
    : path.join(home, DATA_FOLDER)
}

/**
 * Where Electron's profile lives for a channel, per system.
 *
 * `LOCALAPPDATA` on Windows and `XDG_DATA_HOME` on Linux — never `APPDATA`, which roams a profile
 * across a network, and never `~/.config`. `prod` and `beta` share one, so Electron's
 * single-instance lock keeps the two from opening the shared data at once; `dev` has one per
 * checkout, as its data does.
 */
export function profileDirectory(
  engraved: Channel,
  platform: string,
  environment: Record<string, string | undefined>,
  checkout: string = MAIN_CHECKOUT,
): string {
  const path = pathOf(platform)
  const system = systemDataDirectory(platform, environment)
  return engraved === 'dev'
    ? path.join(system, DEV_PROFILE_FOLDER, checkout)
    : path.join(system, PROFILE_FOLDER)
}

/** The system's own data folder, where the profiles live. */
export function systemDataDirectory(
  platform: string,
  environment: Record<string, string | undefined>,
): string {
  const path = pathOf(platform)
  if (platform === 'win32') {
    return (
      named(environment.LOCALAPPDATA) ??
      path.join(homeDirectory(platform, environment), 'AppData', 'Local')
    )
  }
  return (
    named(environment.XDG_DATA_HOME) ??
    path.join(homeDirectory(platform, environment), '.local', 'share')
  )
}

/** The home of the user, as the platform asked about names it. */
export function homeDirectory(
  platform: string,
  environment: Record<string, string | undefined>,
): string {
  const [first, second] =
    platform === 'win32'
      ? [environment.USERPROFILE, environment.HOME]
      : [environment.HOME, environment.USERPROFILE]
  return named(first) ?? named(second) ?? homedir()
}

/**
 * The name a checkout's data folder takes, from what git says of it.
 *
 * The main working tree has its git folder as its common one and is `root`; a linked worktree
 * has one of its own and takes the name of its folder, cut down to what any system accepts as
 * a folder name. A name that is nothing once cut down is `root` too.
 */
export function checkoutFolder(gitDir: string, commonDir: string, topLevel: string): string {
  const path = pathOf(/^[a-z]:|\\/i.test(topLevel) ? 'win32' : 'linux')
  if (path.resolve(gitDir) === path.resolve(commonDir)) return MAIN_CHECKOUT
  const safe = path
    .basename(topLevel)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[.-]+/, '')
  return safe === '' ? MAIN_CHECKOUT : safe
}

/**
 * Which checkout a folder belongs to, asked of git.
 *
 * No git, a folder outside any checkout or a folder that is not there all answer `root`: the
 * question only separates worktrees, and a run that cannot tell is the main one.
 */
export function readCheckout(directory: string): string {
  try {
    const answer = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel'],
      { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    )
    const [gitDir, commonDir, topLevel] = answer.split(/\r?\n/)
    if (gitDir === undefined || commonDir === undefined || topLevel === undefined) {
      return MAIN_CHECKOUT
    }
    return checkoutFolder(gitDir, commonDir, topLevel)
  } catch {
    return MAIN_CHECKOUT
  }
}

/** A variable the system set to something, as opposed to one it set to nothing. */
function named(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value
}

/** The folder a `--data-dir` argument names, or null when there is no such argument. */
export function dataArgument(argv: readonly string[]): string | null {
  const flag = argv.indexOf(DATA_DIRECTORY_FLAG)
  if (flag !== -1) return named(argv[flag + 1])
  const joined = argv.find((entry) => entry.startsWith(`${DATA_DIRECTORY_FLAG}=`))
  return joined === undefined ? null : named(joined.slice(DATA_DIRECTORY_FLAG.length + 1))
}

/** Where a start ends up, or the reason it does not start at all. */
/**
 * Where a start ends up, or the reason it does not start at all: the data folder, the profile
 * Electron is given, and whether they are the ones an argument named rather than the channel's.
 */
export type DataChoice =
  | { accepted: true; directory: string; profile: string; argued: boolean }
  | { accepted: false; reason: string }

/**
 * Whether two paths name the same folder, as the platform asked about would tell them apart.
 *
 * Windows does not tell case apart, and neither may the rule: `c:\users\someone\appdata\local\
 * hemera` is the real data folder as surely as the one Windows spells with capitals,
 * and a comparison that only knows `===` would hand it to a dev build.
 */
function samePath(one: string, other: string, platform: string): boolean {
  return platform === 'win32' ? one.toLowerCase() === other.toLowerCase() : one === other
}

/**
 * The folders this start opens, argument and all.
 *
 * A `prod` or `beta` package ignores the argument: what it opens is decided at build time. A
 * `dev` build honours it, except when the folder named resolves to the real one — the one
 * thing the argument exists to keep away from — and keeps its profile inside it, so a trial
 * leaves nothing behind outside the folder it was given.
 */
export function chooseData(
  engraved: Channel,
  platform: string,
  environment: Record<string, string | undefined>,
  argv: readonly string[],
  checkout: string = MAIN_CHECKOUT,
): DataChoice {
  // Resolved by the platform asked about, as the folders themselves are, so the rule answers
  // the same thing from either machine rather than mixing one system's separators with the
  // other's `resolve`.
  const path = pathOf(platform)
  const asked = engraved === 'dev' ? dataArgument(argv) : null
  if (asked === null) {
    return {
      accepted: true,
      directory: dataDirectory(engraved, platform, environment, checkout),
      profile: profileDirectory(engraved, platform, environment, checkout),
      argued: false,
    }
  }

  const wanted = path.resolve(asked)
  const real = dataDirectory('prod', platform, environment)
  if (samePath(wanted, path.resolve(real), platform)) {
    return {
      accepted: false,
      reason: `${DATA_DIRECTORY_FLAG}: refused ${wanted}, which is the ${real} data folder a dev build must never open`,
    }
  }
  return {
    accepted: true,
    directory: wanted,
    profile: path.join(wanted, ARGUMENT_PROFILE),
    argued: true,
  }
}
