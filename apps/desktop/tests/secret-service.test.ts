import { describe, expect, test } from 'vite-plus/test'

import { busNamesFrom, missingSecretService, passwordStoreSwitch } from '#main/secret-service.ts'

const SECRETS = ['org.freedesktop.DBus', ':1.4', 'org.freedesktop.secrets']
const NO_SECRETS = ['org.freedesktop.DBus', ':1.4']

describe('A desktop Electron does not recognise uses the Secret Service', () => {
  test('Hyprland with a Secret Service on the bus switches to libsecret', () => {
    expect(
      passwordStoreSwitch({
        platform: 'linux',
        env: { XDG_CURRENT_DESKTOP: 'Hyprland' },
        argv: ['hemera'],
        busNames: SECRETS,
      }),
    ).toBe('gnome-libsecret')
  })

  test('no desktop named at all, with a Secret Service, switches too', () => {
    expect(passwordStoreSwitch({ platform: 'linux', env: {}, argv: [], busNames: SECRETS })).toBe(
      'gnome-libsecret',
    )
  })

  test('a desktop Electron picks a keyring for is left to Electron', () => {
    for (const desktop of [
      'GNOME',
      'ubuntu:GNOME',
      'KDE',
      'X-Cinnamon',
      'XFCE',
      'Unity',
      'Pantheon',
      'Deepin',
      'UKUI',
    ]) {
      expect(
        passwordStoreSwitch({
          platform: 'linux',
          env: { XDG_CURRENT_DESKTOP: desktop },
          argv: [],
          busNames: SECRETS,
        }),
      ).toBeNull()
    }
    expect(
      passwordStoreSwitch({
        platform: 'linux',
        env: { DESKTOP_SESSION: 'gnome' },
        argv: [],
        busNames: SECRETS,
      }),
    ).toBeNull()
  })

  test('a password store the user passed is never overridden', () => {
    for (const flag of ['--password-store=basic', '--password-store=kwallet6']) {
      expect(
        passwordStoreSwitch({
          platform: 'linux',
          env: { XDG_CURRENT_DESKTOP: 'Hyprland' },
          argv: ['hemera', flag],
          busNames: SECRETS,
        }),
      ).toBeNull()
    }
  })

  test('without a Secret Service on the bus, or without a bus, nothing is switched', () => {
    const hyprland = { XDG_CURRENT_DESKTOP: 'Hyprland' }
    expect(
      passwordStoreSwitch({ platform: 'linux', env: hyprland, argv: [], busNames: NO_SECRETS }),
    ).toBeNull()
    expect(
      passwordStoreSwitch({ platform: 'linux', env: hyprland, argv: [], busNames: null }),
    ).toBeNull()
  })

  test('other systems are never switched', () => {
    for (const platform of ['win32', 'darwin']) {
      expect(passwordStoreSwitch({ platform, env: {}, argv: [], busNames: SECRETS })).toBeNull()
    }
  })
})

describe('The bus names are read from what dbus-send prints', () => {
  test('every quoted name is kept, and nothing else', () => {
    const printed = [
      'method return time=1 sender=org.freedesktop.DBus -> destination=:1.5 serial=3',
      '   array [',
      '      string "org.freedesktop.DBus"',
      '      string ":1.4"',
      '      string "org.freedesktop.secrets"',
      '   ]',
    ].join('\n')
    expect(busNamesFrom(printed)).toEqual(SECRETS)
  })
})

describe('A missing Secret Service is said, never worked around', () => {
  test('no bus at all names D-Bus', () => {
    expect(missingSecretService({ platform: 'linux', ready: false, busNames: null })).toMatch(
      /D-Bus/,
    )
  })

  test('a bus without a Secret Service names the packages that provide one', () => {
    expect(missingSecretService({ platform: 'linux', ready: false, busNames: NO_SECRETS })).toMatch(
      /gnome-keyring.*KeePassXC/,
    )
  })

  test('a Secret Service that is there but did not serve is not blamed on a package', () => {
    expect(missingSecretService({ platform: 'linux', ready: false, busNames: SECRETS })).toBeNull()
  })

  test('ready storage, or another system, has nothing to say', () => {
    expect(missingSecretService({ platform: 'linux', ready: true, busNames: null })).toBeNull()
    expect(missingSecretService({ platform: 'win32', ready: false, busNames: null })).toBeNull()
  })
})
