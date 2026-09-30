import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { AppIcon } from './app-icon.ts'

/**
 * Hemera's application icon (issue #267): the face at rest on its tile, for the release and for
 * the beta. The packaged PNGs and `.ico` are drawn from this component when a package is built,
 * and the chrome bar and the welcome draw it as it is, so the three never drift apart.
 *
 * Up to 32 px it is its small drawing — a fuller tile, a larger face, heavier strokes — and above
 * it its master.
 */
const meta = {
  tags: ['autodocs'],
  title: 'Components/AppIcon',
  component: AppIcon,
  parameters: { layout: 'centered' },
  args: { channel: 'prod', size: 128, label: 'Hemera' },
  argTypes: {
    channel: {
      control: 'inline-radio',
      options: ['prod', 'beta'],
      description: 'The package it stands for: the release, or the beta.',
    },
    size: {
      control: { type: 'range', min: 16, max: 512, step: 8 },
      description: 'The size in pixels; up to 32 it is the small drawing.',
    },
    label: {
      control: 'text',
      description: 'What it says to whoever cannot see it; left out, it is decoration.',
    },
  },
} satisfies Meta<typeof AppIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

const SIZES = [16, 24, 32, 48, 64, 128, 256] as const

/** Both channels at every size a launcher asks for. */
export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(['prod', 'beta'] as const).map((channel) => (
        <div key={channel} className="flex items-end gap-4">
          {SIZES.map((size) => (
            <AppIcon
              key={size}
              channel={channel}
              size={size}
              label={`${channel} at ${String(size)} px`}
            />
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const small = canvasElement.querySelector('[aria-label="prod at 32 px"]')
    const master = canvasElement.querySelector('[aria-label="prod at 48 px"]')
    await expect(small).toHaveAttribute('data-drawing', 'small')
    await expect(master).toHaveAttribute('data-drawing', 'master')
  },
}

/** The two drawings the icon has: small up to 32 px, its master above. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-end gap-4">
      <AppIcon channel="prod" size={32} label="Small drawing" />
      <AppIcon channel="prod" size={48} label="Master drawing" />
    </div>
  ),
}
