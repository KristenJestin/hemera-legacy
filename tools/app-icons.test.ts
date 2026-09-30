import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vite-plus/test'

import {
  ICO_SIZES,
  LINUX_SIZES,
  VARIANTS,
  drawnFrom,
  icoOf,
  linuxFileOf,
  masterOf,
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

  test('the Windows shell finds the sizes it asks for, up to 256', () => {
    expect(ICO_SIZES).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  test('an image that is not a PNG is refused rather than written', () => {
    expect(() => icoOf([Buffer.from('not a png at all, and long enough')])).toThrow('PNG')
  })

  test('a PNG says its own size', () => {
    expect(sizeOfPng(fakePng(48))).toBe(48)
  })
})

describe('Les tailles Linux', () => {
  test('the set is named as electron-builder reads it, and the deb installs under hicolor', () => {
    expect(LINUX_SIZES).toEqual([16, 24, 32, 48, 64, 128, 256, 512])
    expect(linuxFileOf(48)).toBe('icons/48x48.png')
  })
})

describe('Les maîtres de chaque variante', () => {
  test('up to 32 px an icon is drawn from its small master, above from its full one', () => {
    expect(drawnFrom(16)).toBe('small')
    expect(drawnFrom(32)).toBe('small')
    expect(drawnFrom(48)).toBe('master')
    expect(drawnFrom(1024)).toBe('master')
  })

  test.each(VARIANTS)('%s has both masters, on a square of 1024', (variant) => {
    for (const kind of ['master', 'small'] as const) {
      const file = masterOf(variant, kind)
      expect(existsSync(file), `${variant} has no ${kind} master`).toBe(true)
      expect(readFileSync(file, 'utf8')).toContain('viewBox="0 0 1024 1024"')
    }
  })
})
