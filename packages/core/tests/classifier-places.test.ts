import { describe, expect, test } from 'vite-plus/test'

import {
  CLASSIFIER_POLICY_VERSION,
  CLASSIFIER_STRICTNESS_LEVELS,
  classifierVerdictFromScores,
  concernSaid,
  localClassifierVerdict,
  placesNamed,
  sensitivePlace,
  verdictAtPlaces,
  type PlaceContext,
} from '#index.ts'

const LINUX: PlaceContext = { home: '/home/me', user: 'me', platform: 'linux' }
const MAC: PlaceContext = { home: '/Users/me', user: 'me', platform: 'darwin' }
const WINDOWS: PlaceContext = { home: 'C:\\Users\\me', user: 'me', platform: 'win32' }

/** The paths a command names, with one separator, so a spelling is compared to a place. */
const named = (words: readonly string[], context: PlaceContext) => {
  const read = placesNamed(words, context)
  return { paths: read.paths.map((path) => path.replaceAll('\\', '/')), unreadable: read.unreadable }
}

describe('Paths in a command decide inside or outside', () => {
  test.each([
    // The two commands of the live case.
    [LINUX, ['cat', '~/.ssh/config'], '/home/me/.ssh/config'],
    [LINUX, ['sh', '-c', 'cat "$HOME/.ssh/config"'], '/home/me/.ssh/config'],
    // Every way to spell the home, and the home of another user.
    [LINUX, ['ls', '~'], '/home/me'],
    [LINUX, ['cat', '$HOME/.aws/credentials'], '/home/me/.aws/credentials'],
    [LINUX, ['cat', '${HOME}/.kube/config'], '/home/me/.kube/config'],
    [LINUX, ['cat', '~me/.netrc'], '/home/me/.netrc'],
    [LINUX, ['cat', '~root/.ssh/id_ed25519'], '/root/.ssh/id_ed25519'],
    [LINUX, ['cat', '~alice/notes'], '/home/alice/notes'],
    [LINUX, ['cp', 'a', '--target-directory=~/bin'], '/home/me/bin'],
    [LINUX, ['env', 'KUBECONFIG=~/.kube/config', 'kubectl', 'get', 'pods'], '/home/me/.kube/config'],
    [MAC, ['cat', '~/Library/Keychains/login.keychain-db'], '/Users/me/Library/Keychains/login.keychain-db'],
    [WINDOWS, ['type', '%USERPROFILE%\\.ssh\\config'], 'C:/Users/me/.ssh/config'],
    [WINDOWS, ['Get-Content', '$env:USERPROFILE\\.aws\\credentials'], 'C:/Users/me/.aws/credentials'],
    [WINDOWS, ['type', '~\\.ssh\\config'], 'C:/Users/me/.ssh/config'],
    // Absolute paths and a way up are handed on as written, for the caller to resolve.
    [LINUX, ['cat', '/etc/shadow'], '/etc/shadow'],
    [LINUX, ['cat', '../../elsewhere/file'], '../../elsewhere/file'],
    [WINDOWS, ['type', 'D:\\secrets\\key.txt'], 'D:/secrets/key.txt'],
  ] as const)('%# %j names %s', (context, words, path) => {
    const read = named(words, context)
    expect(read.unreadable).toBeNull()
    expect(read.paths).toContain(path)
  })

  test.each([
    // A shell's string is read as the shell reads it, in its three families.
    [LINUX, ['bash', '-lc', 'cat ${HOME}/.aws/credentials | head'], '/home/me/.aws/credentials'],
    [LINUX, ['sh', '-c', 'cd src && cat < ~/.netrc'], '/home/me/.netrc'],
    [LINUX, ['sudo', 'sh', '-c', 'cat /etc/sudoers'], '/etc/sudoers'],
    [LINUX, ['sh', '-c', "bash -c 'cat ~/.git-credentials'"], '/home/me/.git-credentials'],
    [LINUX, ['sh', '-c', 'eval "cat ~/.pypirc"'], '/home/me/.pypirc'],
    [LINUX, ['sh', '-c', 'cd; cat notes'], '/home/me'],
    [MAC, ['zsh', '-c', 'cat "$HOME/.docker/config.json"'], '/Users/me/.docker/config.json'],
    [WINDOWS, ['cmd', '/c', 'type %USERPROFILE%\\.ssh\\config'], 'C:/Users/me/.ssh/config'],
    [WINDOWS, ['cmd.exe', '/d', '/s', '/c', 'type "%USERPROFILE%\\.npmrc"'], 'C:/Users/me/.npmrc'],
    [
      WINDOWS,
      ['powershell', '-Command', 'Get-Content $env:USERPROFILE\\.ssh\\config'],
      'C:/Users/me/.ssh/config',
    ],
    [WINDOWS, ['pwsh.exe', '-c', 'gc "$HOME\\.azure\\accessTokens.json"'], 'C:/Users/me/.azure/accessTokens.json'],
    [
      WINDOWS,
      ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'gc ~\\.kube\\config'],
      'C:/Users/me/.kube/config',
    ],
  ] as const)('%# the shell string of %j names %s', (context, words, path) => {
    const read = named(words, context)
    expect(read.unreadable).toBeNull()
    expect(read.paths).toContain(path)
  })

  test.each([
    [LINUX, ['sh', '-c', 'cat $(echo ~/.ssh/config)']],
    [LINUX, ['sh', '-c', 'cat `echo x`']],
    [LINUX, ['sh', '-c', 'cat "$SECRET_FILE"']],
    [LINUX, ['sh', '-c', 'cat ${KEY:-x}']],
    [LINUX, ['sh', '-c', 'cat "unclosed']],
    [LINUX, ['sh', '-c', 'cat ~/.{ssh,aws}/config']],
    [LINUX, ['sh', '-c']],
    [LINUX, ['sh']],
    [LINUX, ['sh', '-c', 'echo "cat ~/.ssh/config" | sh']],
    [LINUX, ['python3', '-c', 'print(open("/etc/passwd").read())']],
    [LINUX, ['node', '-e', 'require("fs").readFileSync(require("os").homedir())']],
    [LINUX, ['perl', '-ne', 'print', 'x']],
    [WINDOWS, ['cmd', '/c', 'type %APPDATA%\\x']],
    [WINDOWS, ['powershell', '-EncodedCommand', 'ZwBjACAAfgA=']],
    [WINDOWS, ['pwsh', '-c', 'gc $p']],
    [WINDOWS, ['pwsh', '-c', 'gc $(Resolve-Path ~)']],
  ] as const)('%# %j does not read with confidence', (context, words) => {
    expect(placesNamed(words, context).unreadable).not.toBeNull()
  })

  test.each([
    [LINUX, ['ls', 'src'], ['src']],
    [LINUX, ['ls', '-la', 'src/app'], ['src/app']],
    [LINUX, ['sh', '-c', 'ls src && cat README.md'], ['src', 'README.md']],
    [LINUX, ['git', 'commit', '-m', 'fix the $HOME bug'], ['commit', 'fix the $HOME bug']],
    [LINUX, ['sh', '-c', 'echo "home is $HOME" 2>&1'], ['home is /home/me']],
    [WINDOWS, ['dir', '/b', 'src'], ['src']],
  ] as const)('%# %j names only what is inside', (context, words, paths) => {
    expect(named(words, context)).toEqual({ paths, unreadable: null })
  })
})

describe('Sensitive places always ask', () => {
  test.each([
    [LINUX, '/home/me/.ssh/config', '~/.ssh'],
    [LINUX, '/home/me/.ssh', '~/.ssh'],
    [LINUX, '/home/me/.gnupg/private-keys-v1.d/x.key', '~/.gnupg'],
    [LINUX, '/home/me/.aws/credentials', '~/.aws'],
    [LINUX, '/home/me/.azure/accessTokens.json', '~/.azure'],
    [LINUX, '/home/me/.config/gcloud/credentials.db', '~/.config/gcloud'],
    [LINUX, '/home/me/.kube/config', '~/.kube'],
    [LINUX, '/home/me/.docker/config.json', '~/.docker/config.json'],
    [LINUX, '/home/me/.config/gh/hosts.yml', '~/.config/gh'],
    [LINUX, '/home/me/.netrc', '~/.netrc'],
    [LINUX, '/home/me/.npmrc', '~/.npmrc'],
    [LINUX, '/home/me/.pypirc', '~/.pypirc'],
    [LINUX, '/home/me/.git-credentials', '~/.git-credentials'],
    [LINUX, '/home/me/.local/share/keyrings/login.keyring', '~/.local/share/keyrings'],
    [LINUX, '/home/me/.hemera/hemera.sqlite', '~/.hemera'],
    [LINUX, '/home/me/.hemera-dev/root/hemera.sqlite', '~/.hemera-dev'],
    [LINUX, '/etc/shadow', '/etc/shadow'],
    [LINUX, '/etc/sudoers', '/etc/sudoers'],
    [LINUX, '/etc/sudoers.d/90-me', '/etc/sudoers.d'],
    [LINUX, '/root/.ssh/authorized_keys', '/root/.ssh'],
    [LINUX, '/home/me/work/app/.env', '~/work/app/.env'],
    [LINUX, '/home/me/work/app/config/.env.production', '~/work/app/config/.env.production'],
    [LINUX, '/home/me/work/app/.e*', '~/work/app/.e*'],
    [MAC, '/Users/me/Library/Keychains/login.keychain-db', '~/Library/Keychains'],
    [MAC, '/Users/me/.SSH/config', '~/.SSH'],
    [WINDOWS, 'C:\\Users\\me\\.ssh\\config', '~\\.ssh'],
    [WINDOWS, 'c:\\users\\ME\\.Aws\\credentials', '~\\.Aws'],
    [WINDOWS, 'C:\\work\\app\\.env.local', 'C:\\work\\app\\.env.local'],
  ] as const)('%# %s is the sensitive place %s', (context, path, shown) => {
    expect(sensitivePlace(path, context)).toBe(shown)
  })

  test.each([
    [LINUX, '/home/me/work/app/src/index.ts'],
    [LINUX, '/home/me/work/app/environment.ts'],
    [LINUX, '/home/me/work/app/.environment/x'],
    [LINUX, '/home/me/work/app/*.ts'],
    [LINUX, '/home/me/.config/other'],
    [LINUX, '/home/me/work/ssh/config'],
    [LINUX, '/etc/hosts'],
    [WINDOWS, 'C:\\work\\app\\src\\env.ts'],
  ] as const)('%# %s is not a sensitive place', (context, path) => {
    expect(sensitivePlace(path, context)).toBeNull()
  })
})

describe('What points outside or at a sensitive place asks at every level', () => {
  test('the policy that reads where a call points is a new version', () => {
    expect(CLASSIFIER_POLICY_VERSION).toBe('3')
  })

  test.each(CLASSIFIER_STRICTNESS_LEVELS)(
    'at %s, the two live commands scored harmless by Jev ask',
    (strictness) => {
      // `cat ~/.ssh/config` (risk 0.11) and `sh -c 'cat "$HOME/.ssh/config"'` (risk 0.12), asked
      // for by the user in so many words.
      for (const risk of [0.11, 0.12]) {
        const judged = classifierVerdictFromScores(
          { risk, approval: 0.05, userRequested: 0.97, hasHumanContext: true },
          strictness,
        )
        expect(judged).toBe('allow')
        expect(
          verdictAtPlaces(judged, [
            { kind: 'outside', place: '~/.ssh/config' },
            { kind: 'sensitive', place: '~/.ssh' },
          ]),
        ).toBe('ask')
      }
    },
  )

  test('a refusal of the rules stays a refusal, and nothing concerning leaves the verdict', () => {
    expect(verdictAtPlaces('deny', [{ kind: 'sensitive', place: '.env' }])).toBe('deny')
    expect(verdictAtPlaces('allow', [])).toBe('allow')
  })

  test('a contained read of a sensitive place is not allowed by the rules', () => {
    const concerns = [{ kind: 'sensitive', place: '~/work/app/.env' }] as const
    expect(localClassifierVerdict({ tool: 'fs_read', target: 'inside', concerns })).toBe('defer')
    expect(
      localClassifierVerdict({
        tool: 'commands_run',
        target: 'inside',
        concerns,
        command: { program: 'ls', args: ['.env'], shell: false, platform: 'linux', resolved: null },
      }),
    ).toBe('defer')
    // `ls src` inside, with nothing concerning, is still allowed.
    expect(
      localClassifierVerdict({
        tool: 'commands_run',
        target: 'inside',
        concerns: [],
        command: {
          program: 'ls',
          args: ['src'],
          shell: false,
          platform: 'linux',
          resolved: '/usr/bin/ls',
        },
      }),
    ).toBe('allow')
  })

  test('each concern says why the call asked', () => {
    expect(concernSaid({ kind: 'outside', place: '~/.ssh/config' })).toBe(
      'outside the Workspace: ~/.ssh/config',
    )
    expect(concernSaid({ kind: 'sensitive', place: '~/.ssh' })).toBe('sensitive place: ~/.ssh')
  })
})
