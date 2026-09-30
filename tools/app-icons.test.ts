import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'

import { APP_ICON_TONES, appIconMarkup, drawingFor, roleIn } from '@hemera/ui/app-icon'

import {
  GENERATED,
  ICO_SIZES,
  LINUX_SIZES,
  SOURCE_SIZE,
  iconChannelOf,
  iconFiles,
  icoOf,
  linuxFileOf,
  sizeOfPng,
} from './app-icons.ts'

/** The first bytes of a PNG as far as its size: the signature, then the header chunk. */
function fakePng(size: number, body = 'pixels'): Buffer {
  const header = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'ascii')
  header.writeUInt32BE(size, 16)
  header.writeUInt32BE(size, 20)
  return Buffer.concat([header, Buffer.from(body)])
}

/** The sizes an `.ico` declares in its directory, with 256 read back from its 0. */
function sizesOfIco(ico: Buffer): number[] {
  return Array.from({ length: ico.readUInt16LE(4) }, (_, index) =>
    ico.readUInt8(6 + index * 16),
  ).map((size) => (size === 0 ? 256 : size))
}

describe("L'icône .ico de Windows", () => {
  test('it holds every size, each as its own PNG, in order', () => {
    const images = ICO_SIZES.map((size) => fakePng(size, `image ${String(size)}`))
    const ico = icoOf(images)
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(ICO_SIZES.length)
    images.forEach((png, index) => {
      const entry = 6 + index * 16
      const size = ICO_SIZES[index]!
      // 256 does not fit a byte, and the format writes it as 0.
      expect(ico.readUInt8(entry)).toBe(size === 256 ? 0 : size)
      expect(ico.readUInt8(entry + 1)).toBe(size === 256 ? 0 : size)
      expect(ico.readUInt16LE(entry + 4)).toBe(1)
      expect(ico.readUInt16LE(entry + 6)).toBe(32)
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      expect(ico.subarray(offset, offset + length).equals(png)).toBe(true)
    })
  })

  test('an image that is not a PNG is refused rather than written', () => {
    expect(() => icoOf([Buffer.from('not a png at all, and long enough')])).toThrow('PNG')
  })
})

describe("L'icône suit le composant", () => {
  test.each(['prod', 'beta'] as const)(
    'the %s icon is drawn from AppIcon into every file a package needs, at its size',
    (channel) => {
      const files = new Map(iconFiles(channel))
      expect([...files.keys()]).toEqual(['icon.png', ...LINUX_SIZES.map(linuxFileOf), 'icon.ico'])
      expect(sizeOfPng(files.get('icon.png')!)).toBe(SOURCE_SIZE)
      for (const size of LINUX_SIZES) {
        expect(sizeOfPng(files.get(linuxFileOf(size))!), linuxFileOf(size)).toBe(size)
      }
      expect(sizesOfIco(files.get('icon.ico')!)).toEqual([...ICO_SIZES])
    },
  )

  test('the two channels wear two different icons, down to 16 px', () => {
    for (const size of [16, 48, SOURCE_SIZE]) {
      expect(appIconMarkup('beta', size)).not.toBe(appIconMarkup('prod', size))
    }
  })

  test("a release package wears the stable icon, and a beta's or a dev's the beta", () => {
    expect(iconChannelOf('prod')).toBe('prod')
    expect(iconChannelOf('beta')).toBe('beta')
    expect(iconChannelOf('dev')).toBe('beta')
  })

  test('up to 32 px the icon is its small drawing, above its master', () => {
    expect(drawingFor(16)).toBe('small')
    expect(drawingFor(32)).toBe('small')
    expect(drawingFor(48)).toBe('master')
    expect(appIconMarkup('prod', 16)).toContain('data-drawing="small"')
    expect(appIconMarkup('prod', 256)).toContain('data-drawing="master"')
  })

  test("every colour of the icon is the theme's own", () => {
    const theme = readFileSync(
      join(import.meta.dirname, '..', 'packages', 'ui', 'src', 'theme.css'),
      'utf8',
    )
    for (const [name, tone] of Object.entries(APP_ICON_TONES)) {
      expect(roleIn(theme, tone.role, tone.theme).toLowerCase(), name).toBe(tone.value)
    }
  })
})

describe("L'icône générée à l'empaquetage", () => {
  const repository = join(import.meta.dirname, '..')
  const read = (...path: string[]): string => readFileSync(join(repository, ...path), 'utf8')

  test('electron-builder takes every icon from the folder the tool writes', () => {
    const config = read('apps', 'desktop', 'electron-builder.yml')
    expect(GENERATED).toBe(join(repository, 'apps', 'desktop', 'build', 'generated'))
    expect(config).toContain('icon: build/generated/icon.png')
    expect(config).toContain('icon: build/generated/icon.ico')
    expect(config).toContain('icon: build/generated/icons')
  })

  test('no icon is committed: Git ignores the folder they are drawn into', () => {
    expect(read('.gitignore').split('\n')).toContain('apps/desktop/build/generated/')
  })

  test('a package draws its icon before electron-builder runs, for its own channel', () => {
    const packaging = read('tools', 'package-desktop.ts')
    const drawn = packaging.indexOf("'app-icons.ts'")
    expect(drawn).toBeGreaterThan(-1)
    expect(packaging.slice(drawn, packaging.indexOf('\n', drawn))).toContain('--channel ${channel}')
    expect(drawn).toBeLessThan(packaging.indexOf('pnpm exec electron-builder'))
  })
})
