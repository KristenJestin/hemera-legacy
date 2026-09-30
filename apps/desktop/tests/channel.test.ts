/**
 * Which build opens which data folder, and what no build can be talked into (design D3-06).
 *
 * Each suite is named after the scenario of `specs/application-foundation/spec.md` it covers.
 * Nothing here touches a real data folder: the paths are computed from an environment handed in,
 * and the one folder that exists is a temporary one holding a manifest.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, resolve } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'

import type { Channel } from '@hemera/ipc'

import {
  DATA_DIRECTORY_FLAG,
  MAIN_CHECKOUT,
  VERSION_VARIABLE,
  applicationVersion,
  channel,
  checkoutFolder,
  chooseData,
  dataDirectory,
  profileDirectory,
  readCheckout,
} from '#main/channel.ts'

import { git } from './repositories.ts'

const WINDOWS = {
  LOCALAPPDATA: 'C:\\Users\\someone\\AppData\\Local',
  USERPROFILE: 'C:\\Users\\someone',
}
const LINUX = { XDG_DATA_HOME: '/home/someone/.local/share', HOME: '/home/someone' }

/** A package on disk, as Electron would have loaded it: a folder and the manifest it carries. */
function packaged(hemera: Record<string, string> | null): string {
  const root = mkdtempSync(join(tmpdir(), 'hemera-channel-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(hemera === null ? { name: 'hemera' } : { name: 'hemera', hemera }),
  )
  return root
}

describe('Un paquet prod et un paquet beta ouvrent le même profil', () => {
  test.each([
    ['windows', 'win32', WINDOWS],
    ['linux', 'linux', LINUX],
  ])(
    'a prod package and a beta package resolve the same data folder on %s',
    (_case, platform, env) => {
      const prod = dataDirectory('prod', platform, env)
      const beta = dataDirectory('beta', platform, env)
      expect(beta).toBe(prod)
      expect(prod).toMatch(/[/\\]\.hemera$/)
    },
  )

  test.each([
    ['windows', 'win32', WINDOWS],
    ['linux', 'linux', LINUX],
  ])(
    'and the same Electron profile, whose lock keeps them apart, on %s',
    (_case, platform, env) => {
      expect(profileDirectory('beta', platform, env)).toBe(profileDirectory('prod', platform, env))
    },
  )
})

describe('Le canal dev a son propre profil', () => {
  test.each([
    ['windows', 'win32', WINDOWS],
    ['linux', 'linux', LINUX],
  ])(
    'a dev build reads and writes nothing the real data folder owns on %s',
    (_case, platform, env) => {
      const dev = dataDirectory('dev', platform, env)
      expect(dev).toMatch(/[/\\]\.hemera-dev[/\\]root$/)
      expect(dev).not.toBe(dataDirectory('prod', platform, env))
      expect(profileDirectory('dev', platform, env)).not.toBe(
        profileDirectory('prod', platform, env),
      )
    },
  )
})

describe('Le dossier suit la plateforme', () => {
  test('windows files the data in the home and the profile under the local data folder', () => {
    const environment = { ...WINDOWS, APPDATA: 'C:\\Users\\someone\\AppData\\Roaming' }
    expect(dataDirectory('prod', 'win32', environment)).toBe('C:\\Users\\someone\\.hemera')
    expect(profileDirectory('prod', 'win32', environment)).toBe(`${WINDOWS.LOCALAPPDATA}\\hemera`)
    expect(profileDirectory('beta', 'win32', environment)).toBe(`${WINDOWS.LOCALAPPDATA}\\hemera`)
    expect(profileDirectory('dev', 'win32', environment)).toBe(
      `${WINDOWS.LOCALAPPDATA}\\hemera-dev\\root`,
    )
    expect(dataDirectory('dev', 'win32', environment)).toBe('C:\\Users\\someone\\.hemera-dev\\root')
  })

  test('linux files the data in the home and the profile under the data folder, never .config', () => {
    const environment = { ...LINUX, XDG_CONFIG_HOME: '/home/someone/.config' }
    expect(dataDirectory('prod', 'linux', environment)).toBe('/home/someone/.hemera')
    expect(dataDirectory('beta', 'linux', environment)).toBe('/home/someone/.hemera')
    expect(dataDirectory('dev', 'linux', environment)).toBe('/home/someone/.hemera-dev/root')
    expect(profileDirectory('prod', 'linux', environment)).toBe(`${LINUX.XDG_DATA_HOME}/hemera`)
    expect(profileDirectory('beta', 'linux', environment)).toBe(`${LINUX.XDG_DATA_HOME}/hemera`)
    expect(profileDirectory('dev', 'linux', environment)).toBe(
      `${LINUX.XDG_DATA_HOME}/hemera-dev/root`,
    )
  })

  test('the data folder ignores XDG_DATA_HOME and LOCALAPPDATA', () => {
    expect(dataDirectory('prod', 'linux', { HOME: '/h', XDG_DATA_HOME: '/elsewhere' })).toBe(
      '/h/.hemera',
    )
    expect(
      dataDirectory('prod', 'win32', { USERPROFILE: 'C:\\h', LOCALAPPDATA: 'D:\\elsewhere' }),
    ).toBe('C:\\h\\.hemera')
  })

  test('linux falls back to the data folder the specification names when none is set', () => {
    expect(profileDirectory('prod', 'linux', { HOME: '/home/someone' })).toBe(
      '/home/someone/.local/share/hemera',
    )
  })

  test('windows without LOCALAPPDATA still files the profile under the local data folder', () => {
    expect(profileDirectory('prod', 'win32', { USERPROFILE: 'C:\\Users\\someone' })).toBe(
      'C:\\Users\\someone\\AppData\\Local\\hemera',
    )
  })

  test('the word prod appears nowhere on disk', () => {
    for (const built of ['prod', 'beta', 'dev'] as const) {
      for (const [platform, env] of [
        ['linux', LINUX],
        ['win32', WINDOWS],
      ] as const) {
        expect(dataDirectory(built, platform, env)).not.toMatch(/prod/)
        expect(profileDirectory(built, platform, env)).not.toMatch(/prod/)
      }
    }
  })
})

describe('Chaque checkout dev a son propre dossier', () => {
  test('a dev run from a linked worktree opens .hemera-dev/<worktree folder>', () => {
    expect(dataDirectory('dev', 'linux', LINUX, 'wt-12')).toBe('/home/someone/.hemera-dev/wt-12')
    expect(profileDirectory('dev', 'linux', LINUX, 'wt-12')).toBe(
      `${LINUX.XDG_DATA_HOME}/hemera-dev/wt-12`,
    )
    expect(dataDirectory('dev', 'win32', WINDOWS, 'wt-12')).toBe(
      'C:\\Users\\someone\\.hemera-dev\\wt-12',
    )
  })

  test('a prod or beta package ignores the checkout it was built from', () => {
    expect(dataDirectory('prod', 'linux', LINUX, 'wt-12')).toBe('/home/someone/.hemera')
    expect(dataDirectory('beta', 'linux', LINUX, 'wt-12')).toBe('/home/someone/.hemera')
    expect(profileDirectory('beta', 'linux', LINUX, 'wt-12')).toBe(`${LINUX.XDG_DATA_HOME}/hemera`)
  })

  test('the main working tree is root, a linked worktree is its folder name', () => {
    expect(checkoutFolder('/src/hemera/.git', '/src/hemera/.git', '/src/hemera')).toBe(
      MAIN_CHECKOUT,
    )
    expect(
      checkoutFolder('/src/hemera/.git/worktrees/wt-12', '/src/hemera/.git', '/work/wt-12'),
    ).toBe('wt-12')
    expect(checkoutFolder('C:/src/.git/worktrees/x', 'C:/src/.git', 'C:/work/wt-12')).toBe('wt-12')
  })

  test('a worktree folder name is sanitised to a safe folder name', () => {
    const common = '/src/hemera/.git'
    const gitDir = '/src/hemera/.git/worktrees/x'
    expect(checkoutFolder(gitDir, common, '/work/fix 262: data?')).toBe('fix-262-data-')
    expect(checkoutFolder(gitDir, common, '/work/..')).toBe(MAIN_CHECKOUT)
    expect(checkoutFolder(gitDir, common, '/work/.hidden')).toBe('hidden')
    expect(checkoutFolder(gitDir, common, 'C:\\work\\wt-12')).toBe('wt-12')
  })

  test('--data-dir still overrides the checkout, and holds the profile', () => {
    const choice = chooseData('dev', 'linux', LINUX, [DATA_DIRECTORY_FLAG, '/tmp/apart'], 'wt-12')
    expect(choice).toEqual({
      accepted: true,
      directory: '/tmp/apart',
      profile: '/tmp/apart/profile',
      argued: true,
    })
    expect(chooseData('dev', 'linux', LINUX, [], 'wt-12')).toEqual({
      accepted: true,
      directory: '/home/someone/.hemera-dev/wt-12',
      profile: `${LINUX.XDG_DATA_HOME}/hemera-dev/wt-12`,
      argued: false,
    })
  })
})

describe('Le checkout se lit dans git', () => {
  test('the main working tree reads as root, a linked worktree as its folder name', () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), 'hemera-checkout-')))
    const repository = join(top, 'repository')
    mkdirSync(repository)
    try {
      git(repository, 'init', '--quiet')
      git(repository, 'commit', '--allow-empty', '--quiet', '-m', 'first')
      git(repository, 'worktree', 'add', '--quiet', '--detach', join(top, 'wt-12'))
      mkdirSync(join(repository, 'apps', 'desktop'), { recursive: true })
      mkdirSync(join(top, 'wt-12', 'apps', 'desktop'), { recursive: true })

      expect(readCheckout(repository)).toBe(MAIN_CHECKOUT)
      expect(readCheckout(join(repository, 'apps', 'desktop'))).toBe(MAIN_CHECKOUT)
      expect(readCheckout(join(top, 'wt-12'))).toBe('wt-12')
      expect(readCheckout(join(top, 'wt-12', 'apps', 'desktop'))).toBe('wt-12')
    } finally {
      rmSync(top, { recursive: true, force: true })
    }
  })

  test('a folder outside any checkout, or one that is not there, reads as root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'hemera-no-git-'))
    try {
      expect(readCheckout(outside)).toBe(MAIN_CHECKOUT)
      expect(readCheckout(join(outside, 'missing'))).toBe(MAIN_CHECKOUT)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('Non packagé, c’est dev', () => {
  test('an application started outside a package is dev whatever the environment says', () => {
    const root = packaged({ channel: 'prod' })
    try {
      // The manifest of the repository is right there and says `prod`; it is not a package, so
      // it is not read at all.
      expect(channel(false, root)).toBe('dev')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a package whose manifest names no channel is dev, never prod by omission', () => {
    const root = packaged(null)
    try {
      expect(channel(true, root)).toBe('dev')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test.each<Channel>(['prod', 'beta', 'dev'])(
    'a package built as %s declares itself so',
    (built) => {
      const root = packaged({ channel: built })
      try {
        expect(channel(true, root)).toBe(built)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})

describe('Le canal ne se change pas à l’exécution', () => {
  test('a prod package stays prod against an argument and an environment variable', () => {
    const root = packaged({ channel: 'prod' })
    const argv = ['--channel', 'dev', '--channel=beta']
    const environment = { ...LINUX, HEMERA_CHANNEL: 'dev', NODE_ENV: 'development' }
    try {
      expect(channel(true, root)).toBe('prod')
      // And what it opens follows the channel, not the argument: the flag is refused the
      // moment a build is not `dev`.
      const choice = chooseData('prod', 'linux', environment, [
        ...argv,
        DATA_DIRECTORY_FLAG,
        '/tmp/elsewhere',
      ])
      expect(choice.accepted && choice.directory).toBe(dataDirectory('prod', 'linux', LINUX))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('Un test démarre dans un dossier temporaire', () => {
  test('a dev build pointed at an empty folder opens that folder and nothing else', () => {
    // A real folder of this machine, so the platform asked about is this machine's: a Windows
    // path resolved by the Linux rule is not a folder anywhere.
    const elsewhere = mkdtempSync(join(tmpdir(), 'hemera-data folder-'))
    const here = process.platform === 'win32' ? WINDOWS : LINUX
    try {
      const choice = chooseData('dev', process.platform, here, [DATA_DIRECTORY_FLAG, elsewhere])
      expect(choice.accepted && choice.directory).toBe(resolve(elsewhere))
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  test('the flag is read written either way round', () => {
    const choice = chooseData('dev', 'linux', LINUX, [`${DATA_DIRECTORY_FLAG}=/tmp/apart`])
    expect(choice.accepted && choice.directory).toBe(posix.resolve('/tmp/apart'))
  })
})

describe('Le profil prod n’est pas atteignable par ce chemin', () => {
  test('a dev build pointed at the real data folder refuses, and says which folder it refused', () => {
    const real = dataDirectory('prod', 'linux', LINUX)
    const choice = chooseData('dev', 'linux', LINUX, [DATA_DIRECTORY_FLAG, real])
    expect(choice.accepted).toBe(false)
    expect(choice.accepted || choice.reason).toContain(real)
  })

  test('the refusal holds however the path is written', () => {
    const real = dataDirectory('prod', 'linux', LINUX)
    const roundabout = `${real}/../.hemera`
    const choice = chooseData('dev', 'linux', LINUX, [DATA_DIRECTORY_FLAG, roundabout])
    expect(choice.accepted).toBe(false)
  })

  test('the refusal holds on windows, which does not tell the case of a path apart', () => {
    const real = dataDirectory('prod', 'win32', WINDOWS)
    const shouted = chooseData('dev', 'win32', WINDOWS, [DATA_DIRECTORY_FLAG, real])
    expect(shouted.accepted).toBe(false)

    // The same folder, spelled the way a shell or a script would hand it over.
    const whispered = chooseData('dev', 'win32', WINDOWS, [DATA_DIRECTORY_FLAG, real.toLowerCase()])
    expect(whispered.accepted).toBe(false)
    expect(whispered.accepted || whispered.reason).toContain(real)
  })
})

describe('Un paquet prod ignore l’argument', () => {
  test.each<Channel>(['prod', 'beta'])(
    'a %s package opens its own data folder, argument or not',
    (built) => {
      const asked = mkdtempSync(join(tmpdir(), 'hemera-ignored-'))
      mkdirSync(asked, { recursive: true })
      try {
        const choice = chooseData(built, 'linux', LINUX, [DATA_DIRECTORY_FLAG, asked])
        expect(choice.accepted && choice.directory).toBe(dataDirectory(built, 'linux', LINUX))
      } finally {
        rmSync(asked, { recursive: true, force: true })
      }
    },
  )
})

describe('Un paquet porte sa version', () => {
  test('a package answers the version it was built with', () => {
    expect(applicationVersion(true, '0.3.0-12-gabc1', {})).toBe('0.3.0-12-gabc1')
  })

  test('an environment variable does not rename a package', () => {
    const environment = { [VERSION_VARIABLE]: '9.9.9' }
    expect(applicationVersion(true, '0.3.0-12-gabc1', environment)).toBe('0.3.0-12-gabc1')
  })

  test('a development run wears the label the repository answered', () => {
    const environment = { [VERSION_VARIABLE]: '0.2.0-4-gdeadbee' }
    expect(applicationVersion(false, '0.0.0', environment)).toBe('0.2.0-4-gdeadbee')
  })

  test('a development run and a package answer the same shape, tag or no tag', () => {
    // `git describe` answers a tag, and a tag is written with a `v` a version does not have.
    const environment = { [VERSION_VARIABLE]: 'v0.2.0-4-gdeadbee' }
    expect(applicationVersion(false, '0.0.0', environment)).toBe('0.2.0-4-gdeadbee')
  })

  test('a development run with no label falls back to the manifest rather than inventing one', () => {
    expect(applicationVersion(false, '0.0.0', {})).toBe('0.0.0')
    expect(applicationVersion(false, '0.0.0', { [VERSION_VARIABLE]: '' })).toBe('0.0.0')
  })
})
