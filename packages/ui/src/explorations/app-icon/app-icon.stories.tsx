import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'

/**
 * Hemera's own application icon, drawn from its face (design exploration of 30 September 2026,
 * issue #267). Storybook only: the application still ships Electron's icon until one variant is
 * chosen, and `tools/app-icons.ts` then draws the packaged set from its masters.
 *
 * Every variant is two SVGs beside this file: the master, drawn on a square of 1024 and used from
 * 48 px up, and a small one redrawn for 16 to 32 px, where the master's strokes would melt. The
 * face is the one of `components/face`, at rest: the two chevron eyes and the level mouth, with
 * the strokes `strokes.ts` gives them.
 *
 * - A · Tile · the face alone, white, on a rounded square of Hemera's fuchsia.
 * - B · Line · the face and the outline of its head as one lit line on a dark tile.
 * - C · Monogram · an H whose stems are the sides of the head and whose bar is the mouth, the
 *   two eyes in the counter above it, on a light tile.
 *
 * Each is shown at every size on both grounds — the page's own, and the other theme's, whatever
 * the toolbar says — then in a launcher list as Linux draws one and in a Windows taskbar.
 *
 * Recommended: A. The only one whose silhouette carries on both grounds without a rim, and whose
 * face stays a face at 16 px; the colour is the one the application already speaks in.
 */

type Variant = 'tile' | 'line' | 'monogram'

/** The two masters of each variant, as the bundler serves them. */
const MASTERS: Record<Variant, { master: string; small: string }> = {
  tile: {
    master: new URL('./tile.svg', import.meta.url).href,
    small: new URL('./tile-small.svg', import.meta.url).href,
  },
  line: {
    master: new URL('./line.svg', import.meta.url).href,
    small: new URL('./line-small.svg', import.meta.url).href,
  },
  monogram: {
    master: new URL('./monogram.svg', import.meta.url).href,
    small: new URL('./monogram-small.svg', import.meta.url).href,
  },
}

const NAMES: Record<Variant, string> = {
  tile: 'A · Tile',
  line: 'B · Line',
  monogram: 'C · Monogram',
}

/** The sizes a launcher, a switcher and an installer ask for. */
const SIZES = [16, 24, 32, 48, 128, 256] as const

/** Up to 32 px an icon is drawn from its small master, as `tools/app-icons.ts` does. */
function masterFor(size: number): 'master' | 'small' {
  return size <= 32 ? 'small' : 'master'
}

/** The icon at an exact size in pixels, which is what a launcher draws it at. */
function AppIcon({
  variant,
  size,
  label = '',
}: {
  variant: Variant
  size: number
  label?: string
}): ReactNode {
  const master = masterFor(size)
  return (
    <img
      src={MASTERS[variant][master]}
      data-master={master}
      width={size}
      height={size}
      alt={label}
    />
  )
}

type Ground = 'page' | 'other'

/** The page's own ground, and the other theme's: `foreground` is the page turned over. */
const GROUNDS: Record<Ground, string> = {
  page: 'rounded-lg bg-background p-6 text-foreground',
  other: 'rounded-lg bg-foreground p-6 text-background',
}

/** A stand-in for another application, in the ground's own ink, at a launcher's two sizes. */
const OTHER_APP: Record<Ground, Record<24 | 32, string>> = {
  page: {
    24: 'size-6 shrink-0 rounded-md bg-foreground/15',
    32: 'size-8 shrink-0 rounded-md bg-foreground/15',
  },
  other: {
    24: 'size-6 shrink-0 rounded-md bg-background/20',
    32: 'size-8 shrink-0 rounded-md bg-background/20',
  },
}

const SELECTED_ROW: Record<Ground, string> = {
  page: 'flex items-center gap-3 rounded-md bg-foreground/10 px-3 py-2',
  other: 'flex items-center gap-3 rounded-md bg-background/15 px-3 py-2',
}

function OtherApp({ ground, size }: { ground: Ground; size: 24 | 32 }): ReactNode {
  return <span aria-hidden="true" className={OTHER_APP[ground][size]} />
}

/** Every size, smallest first, each with its number under it. */
function Sizes({ variant, ground }: { variant: Variant; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <ul className="flex items-end gap-6" aria-label={`${NAMES[variant]} at every size`}>
        {SIZES.map((size) => (
          <li key={size} className="flex flex-col items-center gap-2">
            <AppIcon variant={variant} size={size} label={`${String(size)} px`} />
            <span className="text-xs tabular-nums">{size}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const LAUNCHED = ['Files', 'Firefox', 'Terminal', 'Settings'] as const

/** A launcher list as a Linux desktop draws one: a search, and rows of 32 px icons. */
function LinuxLauncher({ variant, ground }: { variant: Variant; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <div className="flex w-menu flex-col gap-1" aria-label="Linux launcher">
        <span className="px-3 py-2 text-sm">he</span>
        <div className={SELECTED_ROW[ground]}>
          <AppIcon variant={variant} size={32} label="Hemera" />
          <span className="text-sm">Hemera</span>
        </div>
        {LAUNCHED.map((name) => (
          <div key={name} className="flex items-center gap-3 px-3 py-2">
            <OtherApp ground={ground} size={32} />
            <span className="text-sm">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const RUNNING_MARK: Record<Ground, string> = {
  page: 'h-0.5 w-3 rounded-full bg-primary',
  other: 'h-0.5 w-3 rounded-full bg-background',
}

/** A Windows taskbar: 24 px icons, centred, the running one marked under it. */
function WindowsTaskbar({ variant, ground }: { variant: Variant; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <div className="flex h-12 items-center justify-center gap-2 px-4" aria-label="Taskbar">
        {[0, 1].map((index) => (
          <span key={index} className="flex size-10 items-center justify-center">
            <OtherApp ground={ground} size={24} />
          </span>
        ))}
        <span className="flex size-10 flex-col items-center justify-center gap-1">
          <AppIcon variant={variant} size={24} label="Hemera" />
          <span className={RUNNING_MARK[ground]} />
        </span>
        {[2, 3].map((index) => (
          <span key={index} className="flex size-10 items-center justify-center">
            <OtherApp ground={ground} size={24} />
          </span>
        ))}
      </div>
    </div>
  )
}

/** One variant: its sizes, its largest drawing, and both launchers, on both grounds. */
function Sheet({ variant }: { variant: Variant }): ReactNode {
  return (
    <section className="flex flex-col gap-6" aria-label={NAMES[variant]}>
      <div className="grid grid-cols-2 gap-6">
        <Sizes variant={variant} ground="page" />
        <Sizes variant={variant} ground="other" />
        <LinuxLauncher variant={variant} ground="page" />
        <LinuxLauncher variant={variant} ground="other" />
        <WindowsTaskbar variant={variant} ground="page" />
        <WindowsTaskbar variant={variant} ground="other" />
      </div>
      <AppIcon variant={variant} size={512} label={`${NAMES[variant]} at 512 px`} />
    </section>
  )
}

/** The three at the sizes they are hardest at, side by side, on both grounds. */
function Compared(): ReactNode {
  const variants: Variant[] = ['tile', 'line', 'monogram']
  return (
    <div className="grid grid-cols-2 gap-6">
      {(['page', 'other'] as const).map((ground) => (
        <div key={ground} className={GROUNDS[ground]}>
          <ul className="flex flex-col gap-6" aria-label="The three variants">
            {variants.map((variant) => (
              <li key={variant} className="flex items-center gap-6">
                <span className="w-24 text-sm">{NAMES[variant]}</span>
                {[16, 24, 32, 48, 128].map((size) => (
                  <AppIcon
                    key={size}
                    variant={variant}
                    size={size}
                    label={`${NAMES[variant]} at ${String(size)} px`}
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

const meta = {
  title: 'Explorations/App icon',
  tags: ['autodocs', 'new'],
  parameters: { layout: 'padded', controls: { disable: true } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Every size of a variant is drawn, from the master it belongs to. */
async function drawnAtEverySize(canvasElement: HTMLElement, variant: Variant): Promise<void> {
  const canvas = within(canvasElement)
  const sizes = canvas.getAllByRole('list', { name: `${NAMES[variant]} at every size` })
  expect(sizes).toHaveLength(2)
  const small = within(sizes[0]!).getByRole('img', { name: '16 px' })
  const large = within(sizes[0]!).getByRole('img', { name: '256 px' })
  await expect(small).toHaveAttribute('data-master', 'small')
  await expect(small).toHaveAttribute('src', MASTERS[variant].small)
  await expect(large).toHaveAttribute('data-master', 'master')
  await expect(large).toHaveAttribute('src', MASTERS[variant].master)
}

export const ATile: Story = {
  name: 'A · Tile',
  render: () => <Sheet variant="tile" />,
  play: async ({ canvasElement }) => drawnAtEverySize(canvasElement, 'tile'),
}

export const BLine: Story = {
  name: 'B · Line',
  render: () => <Sheet variant="line" />,
  play: async ({ canvasElement }) => drawnAtEverySize(canvasElement, 'line'),
}

export const CMonogram: Story = {
  name: 'C · Monogram',
  render: () => <Sheet variant="monogram" />,
  play: async ({ canvasElement }) => drawnAtEverySize(canvasElement, 'monogram'),
}

export const SideBySide: Story = {
  name: 'Side by side',
  render: () => <Compared />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('list', { name: 'The three variants' })).toHaveLength(2)
  },
}
