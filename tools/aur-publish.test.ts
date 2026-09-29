import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'

import {
  AUR_PACKAGES,
  arrayOf,
  expandedSource,
  renderPkgbuild,
  renderSrcinfo,
  scalarOf,
  skippedWithout,
  versionOf,
} from './aur-publish.ts'

const packaging = resolve(import.meta.dirname, '..', 'packaging', 'aur')
const pkgbuildOf = (name: string): string => readFileSync(join(packaging, name, 'PKGBUILD'), 'utf8')
const srcinfoOf = (name: string): string => readFileSync(join(packaging, name, '.SRCINFO'), 'utf8')

const HASH = 'a'.repeat(64)

describe('A release becomes hemera-bin', () => {
  test('the tag semantic-release puts on main is the pkgver', () => {
    expect(versionOf('hemera-bin', 'v0.4.0')).toEqual({ version: '0.4.0', pkgver: '0.4.0' })
  })

  test('a beta tag is refused', () => {
    expect(() => versionOf('hemera-bin', 'beta-0.4.0-3-gabc1234')).toThrow()
  })
})

describe('A beta becomes hemera-beta-bin', () => {
  test('the commits since the tag and the hash follow the version, without a dash', () => {
    expect(versionOf('hemera-beta-bin', 'beta-0.4.0-3-gabc1234')).toEqual({
      version: '0.4.0-3-gabc1234',
      pkgver: '0.4.0.r3.gabc1234',
    })
  })

  test('a beta built on the tagged commit itself is that version', () => {
    expect(versionOf('hemera-beta-bin', 'beta-0.4.0')).toEqual({
      version: '0.4.0',
      pkgver: '0.4.0',
    })
  })

  test('a release tag is refused', () => {
    expect(() => versionOf('hemera-beta-bin', 'v0.4.0')).toThrow()
  })
})

describe('The PKGBUILD follows the release', () => {
  test.each(AUR_PACKAGES)('%s takes the new version, pkgrel 1 and the new checksum', (name) => {
    const tag = name === 'hemera-bin' ? 'v0.4.0' : 'beta-0.4.0-3-gabc1234'
    const version = versionOf(name, tag)
    const rendered = renderPkgbuild(
      pkgbuildOf(name).replace(/^pkgrel=.*$/m, 'pkgrel=4'),
      version,
      HASH,
    )

    expect(rendered).toMatch(new RegExp(`^pkgver=${version.pkgver.replaceAll('.', '\\.')}$`, 'm'))
    expect(rendered).toMatch(/^pkgrel=1$/m)
    expect(rendered).toMatch(new RegExp(`^sha256sums=\\('${HASH}'\\)$`, 'm'))
    if (name === 'hemera-beta-bin') expect(rendered).toMatch(/^_version=0\.4\.0-3-gabc1234$/m)
  })

  test('the beta downloads the asset GitHub names after its tag', () => {
    const rendered = renderPkgbuild(
      pkgbuildOf('hemera-beta-bin'),
      versionOf('hemera-beta-bin', 'beta-0.4.0-3-gabc1234'),
      HASH,
    )
    expect(expandedSource(rendered)).toBe(
      'hemera-beta-0.4.0-3-gabc1234.deb::https://github.com/KristenJestin/hemera/releases/download/beta-0.4.0-3-gabc1234/Hemera.Beta-0.4.0-3-gabc1234.deb',
    )
  })

  test('the release downloads the deb attached to its tag', () => {
    const rendered = renderPkgbuild(
      pkgbuildOf('hemera-bin'),
      versionOf('hemera-bin', 'v0.4.0'),
      HASH,
    )
    expect(expandedSource(rendered)).toBe(
      'hemera-0.4.0.deb::https://github.com/KristenJestin/hemera/releases/download/v0.4.0/Hemera-0.4.0.deb',
    )
  })
})

describe('The .SRCINFO follows the PKGBUILD', () => {
  // The committed .SRCINFO is what `makepkg --printsrcinfo` wrote: rendering it again from its
  // own PKGBUILD must change nothing, or the rendering says something makepkg does not.
  test.each(AUR_PACKAGES)('%s is rendered from its own PKGBUILD as makepkg wrote it', (name) => {
    expect(renderSrcinfo(srcinfoOf(name), pkgbuildOf(name))).toBe(srcinfoOf(name))
  })

  test.each(AUR_PACKAGES)('%s carries the new version, source and checksum', (name) => {
    const tag = name === 'hemera-bin' ? 'v0.4.0' : 'beta-0.4.0-3-gabc1234'
    const version = versionOf(name, tag)
    const pkgbuild = renderPkgbuild(pkgbuildOf(name), version, HASH)
    const rendered = renderSrcinfo(srcinfoOf(name), pkgbuild)

    expect(rendered).toContain(`\tpkgver = ${version.pkgver}\n`)
    expect(rendered).toContain('\tpkgrel = 1\n')
    expect(rendered).toContain(`\tsource = ${expandedSource(pkgbuild)}\n`)
    expect(rendered).toContain(`\tsha256sums = ${HASH}\n`)
  })
})

describe('Publishing without the AUR key', () => {
  test('an absent key skips the publication with a notice', () => {
    expect(skippedWithout({}, 'hemera-bin')).toContain('AUR_SSH_KEY')
  })

  test('an empty key, which is what an absent secret becomes in a workflow, skips too', () => {
    expect(skippedWithout({ AUR_SSH_KEY: '' }, 'hemera-bin')).toContain('AUR_SSH_KEY')
  })

  test('a key publishes', () => {
    expect(skippedWithout({ AUR_SSH_KEY: 'key' }, 'hemera-bin')).toBeNull()
  })
})

describe('The release and the beta install to the same place', () => {
  test.each(AUR_PACKAGES)('%s installs as hemera', (name) => {
    expect(scalarOf(pkgbuildOf(name), '_app')).toBe('hemera')
  })

  test.each(AUR_PACKAGES)(
    '%s provides and conflicts with hemera, so one replaces the other',
    (name) => {
      expect(arrayOf(pkgbuildOf(name), 'provides')).toEqual(['hemera'])
      expect(arrayOf(pkgbuildOf(name), 'conflicts')).toEqual(['hemera'])
    },
  )

  test.each(AUR_PACKAGES)('%s says so in its .SRCINFO too', (name) => {
    expect(srcinfoOf(name)).toContain('\tprovides = hemera\n')
    expect(srcinfoOf(name)).toContain('\tconflicts = hemera\n')
  })

  test.each(AUR_PACKAGES)(
    '%s installs /opt/hemera, /usr/bin/hemera, hemera.desktop and the hemera icon',
    (name) => {
      const pkgbuild = pkgbuildOf(name)
      expect(pkgbuild).toContain('"$pkgdir/opt/$_app"')
      expect(pkgbuild).toMatch(/ln -s "\/opt\/\$_app\/\$\w+" "\$pkgdir\/usr\/bin\/\$_app"/)
      expect(pkgbuild).toContain('"$pkgdir/usr/share/applications/$_app.desktop"')
      expect(pkgbuild).toContain('Icon=$_app')
      expect(pkgbuild).toMatch(/\/apps\/\$_app\./)
    },
  )

  test('the beta still downloads its own deb, under its own name', () => {
    expect(expandedSource(pkgbuildOf('hemera-beta-bin'))).toMatch(/^hemera-beta-.*Hemera\.Beta-/)
  })
})

describe('A PKGBUILD array is read as makepkg reads it', () => {
  test('its words are unquoted and expanded', () => {
    const pkgbuild = '_app=hemera\nprovides=("$_app" \'other\' plain)\n'
    expect(arrayOf(pkgbuild, 'provides')).toEqual(['hemera', 'other', 'plain'])
  })

  test('an array the PKGBUILD does not assign is refused', () => {
    expect(() => arrayOf('_app=hemera\n', 'provides')).toThrow()
  })
})
