#!/usr/bin/env node
/**
 * Draws Hemera's application icon for the packages, from the master SVGs of one variant.
 *
 * electron-builder takes its icons from `apps/desktop/build/`: `icon.png` (1024) as the source
 * of everything it is not handed, `icons/<n>x<n>.png` for Linux, which the deb installs under
 * `hicolor` as `hemera.png`, and `icon.ico` for Windows. Each variant has two masters: the full
 * one, and a small one redrawn for 16 to 32 px, where the full drawing would blur its strokes
 * together. The SVGs are rasterised by Chromium, which is what already draws them in Storybook,
 * so what is packaged is what was chosen there.
 *
 *   node tools/app-icons.ts <tile|line|monogram> [--out <folder>]
 *
 * Without `--out` it writes into `apps/desktop/build/`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')

/** Where the masters are drawn, as the Storybook exploration of the icon shows them. */
const MASTERS = join(repository, 'packages', 'ui', 'src', 'explorations', 'app-icon')

export const VARIANTS = ['tile', 'line', 'monogram'] as const

export type Variant = (typeof VARIANTS)[number]

/** The sizes of the Linux set, the ones launchers and the `hicolor` theme ask for. */
export const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const

/** The sizes of the Windows icon: the taskbar, the Explorer views and the Alt+Tab switcher. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const

/** The largest size drawn from the small master. */
const SMALL_UP_TO = 32

/** The size of the one PNG electron-builder derives the rest from. */
const SOURCE_SIZE = 1024

/** Which master a size is drawn from. */
export function drawnFrom(size: number): 'master' | 'small' {
  return size <= SMALL_UP_TO ? 'small' : 'master'
}

/** The file of a variant's master. */
export function masterOf(variant: Variant, kind: 'master' | 'small'): string {
  return join(MASTERS, kind === 'small' ? `${variant}-small.svg` : `${variant}.svg`)
}

/** Where a size of the Linux set goes, under the build folder. */
export function linuxFileOf(size: number): string {
  return `icons/${String(size)}x${String(size)}.png`
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The width a PNG declares in its header; the icons are square. */
export function sizeOfPng(png: Buffer): number {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('an image of the icon is not a PNG')
  }
  return png.readUInt32BE(16)
}

/**
 * A Windows icon holding each image as its PNG, which every Windows since Vista reads: a header,
 * one directory entry per image, then the images one after the other.
 */
export function icoOf(images: readonly Buffer[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + images.length * 16
  const entries = images.map((png) => {
    const size = sizeOfPng(png)
    const entry = Buffer.alloc(16)
    // A byte holds up to 255, and 0 is how the format says 256.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}

/** Each size drawn by Chromium from the master it belongs to, on a transparent ground. */
async function rasterised(
  variant: Variant,
  sizes: readonly number[],
): Promise<Map<number, Buffer>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    // One page per size, each drawn at its own viewport, all at once.
    const drawn = await Promise.all(
      sizes.map(async (size): Promise<[number, Buffer]> => {
        const page = await browser.newPage({
          deviceScaleFactor: 1,
          viewport: { width: size, height: size },
        })
        const svg = readFileSync(masterOf(variant, drawnFrom(size)), 'utf8').replace(
          '<svg ',
          `<svg width="${String(size)}" height="${String(size)}" `,
        )
        await page.setContent(
          `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
        )
        const png = await page.screenshot({
          omitBackground: true,
          clip: { x: 0, y: 0, width: size, height: size },
        })
        return [size, png]
      }),
    )
    return new Map(drawn)
  } finally {
    await browser.close()
  }
}

/** Writes the icon of a variant into a build folder: the source PNG, the Linux set, the ICO. */
export async function writeIcons(variant: Variant, out: string): Promise<string[]> {
  const sizes = [...new Set([SOURCE_SIZE, ...LINUX_SIZES, ...ICO_SIZES])]
  const drawn = await rasterised(variant, sizes)
  const png = (size: number): Buffer => drawn.get(size)!
  const files: [string, Buffer][] = [
    ['icon.png', png(SOURCE_SIZE)],
    ...LINUX_SIZES.map((size): [string, Buffer] => [linuxFileOf(size), png(size)]),
    ['icon.ico', icoOf(ICO_SIZES.map(png))],
  ]
  for (const [name, data] of files) {
    const file = join(out, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  return files.map(([name]) => name)
}

function variantOf(asked: string | undefined): Variant {
  const found = VARIANTS.find((variant) => variant === asked)
  if (found === undefined) throw new Error(`name a variant: ${VARIANTS.join(', ')}`)
  return found
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    const variant = variantOf(args[0])
    const at = args.indexOf('--out')
    const out =
      at === -1 ? join(repository, 'apps', 'desktop', 'build') : resolve(args[at + 1] ?? '.')
    const written = await writeIcons(variant, out)
    console.log(`${variant}: ${written.join(', ')} in ${out}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
