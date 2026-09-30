import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'

import { AppIconDrawing, type AppIconLook } from '../../components/app-icon/app-icon.ts'

/**
 * The beta's icon (design exploration of 30 September 2026, issue #267). The stable icon is
 * chosen — the face at rest on Hemera's fuchsia tile, `Components/AppIcon` — and a beta package
 * installs where the release does, so the two have to be told apart in a launcher at a glance,
 * without reading anything. Three proposals, each drawn by `AppIconDrawing`, the component the
 * packages are drawn from:
 *
 * - A · Cyan · the same face on a tile of the build's cyan.
 * - B · Badge · the stable tile, an amber disc cut into its corner, with a β from 48 px up; under
 *   48 px the disc stays and the letter goes, and at 16 px the disc is some five pixels.
 * - C · Outline · the stable tile turned inside out: a fuchsia ring round a white tile, and the
 *   face in fuchsia.
 *
 * Each is shown beside the stable icon at every size, on both grounds — the page's own and the
 * other theme's, whatever the toolbar says — in a launcher list as Linux draws one, and in a
 * Windows taskbar.
 *
 * Recommended: A. A whole tile of another colour is the one difference that is read before
 * anything else, at 16 px as at 256, on a light launcher as on a dark one, and it keeps the face
 * exactly as it is. The badge needs the eye to find a corner, and the outline reads as a lighter
 * stable icon on a light launcher.
 */

type Proposal = Exclude<AppIconLook, 'stable'>

const NAMES: Record<Proposal, string> = {
  'beta-cyan': 'A · Cyan',
  'beta-badge': 'B · Badge',
  'beta-outline': 'C · Outline',
}

/** The sizes a launcher, a switcher and an installer ask for. */
const SIZES = [16, 24, 32, 48, 128, 256] as const

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

const RUNNING_MARK: Record<Ground, string> = {
  page: 'h-0.5 w-3 rounded-full bg-foreground',
  other: 'h-0.5 w-3 rounded-full bg-background',
}

function OtherApp({ ground, size }: { ground: Ground; size: 24 | 32 }): ReactNode {
  return <span aria-hidden="true" className={OTHER_APP[ground][size]} />
}

/** The stable icon over the proposal, at every size, each size numbered under the pair. */
function Sizes({ look, ground }: { look: Proposal; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <ul className="flex items-end gap-6" aria-label={`${NAMES[look]} at every size`}>
        {SIZES.map((size) => (
          <li key={size} className="flex flex-col items-center gap-2">
            <AppIconDrawing look="stable" size={size} label={`Stable at ${String(size)} px`} />
            <AppIconDrawing look={look} size={size} label={`Beta at ${String(size)} px`} />
            <span className="text-xs tabular-nums">{size}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A launcher list as a Linux desktop draws one, searched for both: rows of 32 px icons. */
function LinuxLauncher({ look, ground }: { look: Proposal; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <div className="flex w-menu flex-col gap-1" aria-label="Linux launcher">
        <span className="px-3 py-2 text-sm">he</span>
        <div className={SELECTED_ROW[ground]}>
          <AppIconDrawing look="stable" size={32} label="Hemera" />
          <span className="text-sm">Hemera</span>
        </div>
        <div className="flex items-center gap-3 px-3 py-2">
          <AppIconDrawing look={look} size={32} label="Hemera Beta" />
          <span className="text-sm">Hemera Beta</span>
        </div>
        {['Files', 'Firefox', 'Terminal'].map((name) => (
          <div key={name} className="flex items-center gap-3 px-3 py-2">
            <OtherApp ground={ground} size={32} />
            <span className="text-sm">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A Windows taskbar: 24 px icons, centred, both running and marked under them. */
function WindowsTaskbar({ look, ground }: { look: Proposal; ground: Ground }): ReactNode {
  return (
    <div className={GROUNDS[ground]}>
      <div className="flex h-12 items-center justify-center gap-2 px-4" aria-label="Taskbar">
        {[0, 1].map((index) => (
          <span key={index} className="flex size-10 items-center justify-center">
            <OtherApp ground={ground} size={24} />
          </span>
        ))}
        {(['stable', look] as const).map((drawn) => (
          <span key={drawn} className="flex size-10 flex-col items-center justify-center gap-1">
            <AppIconDrawing
              look={drawn}
              size={24}
              label={drawn === 'stable' ? 'Hemera' : 'Hemera Beta'}
            />
            <span className={RUNNING_MARK[ground]} />
          </span>
        ))}
        {[2, 3].map((index) => (
          <span key={index} className="flex size-10 items-center justify-center">
            <OtherApp ground={ground} size={24} />
          </span>
        ))}
      </div>
    </div>
  )
}

/** One proposal beside the stable icon: every size and both launchers, on both grounds. */
function Sheet({ look }: { look: Proposal }): ReactNode {
  return (
    <section className="flex flex-col gap-6" aria-label={NAMES[look]}>
      <div className="grid grid-cols-2 gap-6">
        <Sizes look={look} ground="page" />
        <Sizes look={look} ground="other" />
        <LinuxLauncher look={look} ground="page" />
        <LinuxLauncher look={look} ground="other" />
        <WindowsTaskbar look={look} ground="page" />
        <WindowsTaskbar look={look} ground="other" />
      </div>
      <div className="flex items-end gap-6">
        <AppIconDrawing look="stable" size={512} label="Stable at 512 px" />
        <AppIconDrawing look={look} size={512} label={`${NAMES[look]} at 512 px`} />
      </div>
    </section>
  )
}

/** The three proposals beside the stable icon, at the sizes a launcher list uses. */
function Compared(): ReactNode {
  const looks: Proposal[] = ['beta-cyan', 'beta-badge', 'beta-outline']
  return (
    <div className="grid grid-cols-2 gap-6">
      {(['page', 'other'] as const).map((ground) => (
        <div key={ground} className={GROUNDS[ground]}>
          <ul className="flex flex-col gap-6" aria-label="The three proposals">
            {looks.map((look) => (
              <li key={look} className="flex items-center gap-6">
                <span className="w-24 text-sm">{NAMES[look]}</span>
                {[16, 24, 32, 48].map((size) => (
                  <span key={size} className="flex items-center gap-1">
                    <AppIconDrawing
                      look="stable"
                      size={size}
                      label={`Stable at ${String(size)} px`}
                    />
                    <AppIconDrawing
                      look={look}
                      size={size}
                      label={`${NAMES[look]} at ${String(size)} px`}
                    />
                  </span>
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

/** The proposal is drawn at every size beside the stable icon, and never as it. */
async function besideTheStable(canvasElement: HTMLElement, look: Proposal): Promise<void> {
  const canvas = within(canvasElement)
  const lists = canvas.getAllByRole('list', { name: `${NAMES[look]} at every size` })
  expect(lists).toHaveLength(2)
  for (const size of SIZES) {
    const beta = within(lists[0]!).getByRole('img', { name: `Beta at ${String(size)} px` })
    expect(beta).toHaveAttribute('data-app-icon', look)
    expect(beta).toHaveAttribute('data-drawing', size <= 32 ? 'small' : 'master')
  }
}

export const BetaACyan: Story = {
  name: 'Beta A · Cyan',
  render: () => <Sheet look="beta-cyan" />,
  play: async ({ canvasElement }) => besideTheStable(canvasElement, 'beta-cyan'),
}

export const BetaBBadge: Story = {
  name: 'Beta B · Badge',
  render: () => <Sheet look="beta-badge" />,
  play: async ({ canvasElement }) => besideTheStable(canvasElement, 'beta-badge'),
}

export const BetaCOutline: Story = {
  name: 'Beta C · Outline',
  render: () => <Sheet look="beta-outline" />,
  play: async ({ canvasElement }) => besideTheStable(canvasElement, 'beta-outline'),
}

export const SideBySide: Story = {
  name: 'Side by side',
  render: () => <Compared />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('list', { name: 'The three proposals' })).toHaveLength(2)
  },
}
