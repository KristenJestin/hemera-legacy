#!/usr/bin/env node
/**
 * Draws Hemera's application icon for a package, from the design system's `AppIcon`.
 *
 * Run by `tools/package-desktop.ts` before electron-builder, so a package always wears the icon
 * the component draws today: nobody regenerates anything by hand, and no icon is committed. The
 * component is rendered to a standalone SVG by `react-dom/server` and rasterised by resvg, which
 * needs no browser and draws the same pixels on every machine.
 *
 * It writes into `apps/desktop/build/generated/` (ignored by Git), where electron-builder is
 * pointed: `icon.png` (1024), `icons/<n>x<n>.png` for Linux, which the deb installs under
 * `hicolor` named after the executable, and `icon.ico` for Windows.
 *
 *   node tools/app-icons.ts [--channel prod|beta|dev] [--out <folder>]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { type AppIconChannel, appIconMarkup } from '@hemera/ui/app-icon'
import { Resvg } from '@resvg/resvg-js'

const repository = resolve(import.meta.dirname, '..')

/** Where the icons are written, and where `electron-builder.yml` looks for them. */
export const GENERATED = join(repository, 'apps', 'desktop', 'build', 'generated')

/** The sizes of the Linux set, the ones launchers and the `hicolor` theme ask for. */
export const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const

/** The sizes of the Windows icon: the taskbar, the Explorer views and the Alt+Tab switcher. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const

/** The size of the one PNG electron-builder derives anything else from. */
export const SOURCE_SIZE = 1024

/**
 * The icon a package's channel wears. A `dev` package wears the beta's: it is never the release,
 * and should never be taken for it in a launcher.
 */
export function iconChannelOf(channel: string): AppIconChannel {
  return channel === 'prod' ? 'prod' : 'beta'
}

/** Where a size of the Linux set goes, under the output folder. */
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
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}

/** The icon of a channel at a size, as a PNG. */
export function pngOf(channel: AppIconChannel, size: number): Buffer {
  const svg = appIconMarkup(channel, size)
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

/** Every file of a channel's icon, named as it is written under the output folder. */
export function iconFiles(channel: AppIconChannel): [string, Buffer][] {
  const drawn = new Map(
    [...new Set([SOURCE_SIZE, ...LINUX_SIZES, ...ICO_SIZES])].map((size) => [
      size,
      pngOf(channel, size),
    ]),
  )
  const png = (size: number): Buffer => drawn.get(size)!
  return [
    ['icon.png', png(SOURCE_SIZE)],
    ...LINUX_SIZES.map((size): [string, Buffer] => [linuxFileOf(size), png(size)]),
    ['icon.ico', icoOf(ICO_SIZES.map(png))],
  ]
}

/** Writes a channel's icon into a folder, and says what it wrote. */
export function writeIcons(channel: AppIconChannel, out: string): string[] {
  const files = iconFiles(channel)
  for (const [name, data] of files) {
    const file = join(out, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  return files.map(([name]) => name)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const at = args.indexOf(flag)
    return at === -1 ? undefined : args[at + 1]
  }
  const channel = iconChannelOf(valueOf('--channel') ?? 'dev')
  const out = resolve(valueOf('--out') ?? GENERATED)
  const written = writeIcons(channel, out)
  console.log(`the ${channel} icon: ${written.join(', ')} in ${out}`)
}
