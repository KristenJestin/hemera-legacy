import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import type { Opening } from './helper-viewer.tsx'
import { type HeadPlacement, type Kind, SessionPage } from './page.tsx'

/**
 * The exploration of issue #77 as one page to try by hand (30 September 2026): a toolbar picks
 * the kind of Session — `free`, `define`, `build` — where the head line stands (A across the page,
 * B over the chat only) and how a helper's thread opens (a sheet under the head line, a dialog, a
 * side sheet). Everything else is live: the panel's fold and its place over the chat, the run and
 * helper chips, the notices and their answer, the tasks' grouping and each task's detail. Light
 * and dark through Storybook's own toolbar. The moments, one story each, are in `Screens`.
 */

const TOOLBAR =
  'flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-muted px-4 py-1.5 text-xs'

const CHOICE =
  'rounded-sm px-2 py-0.5 text-muted-foreground outline-none hover:text-foreground focus-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm'

function Choices<Value extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: readonly { value: Value; label: string }[]
  value: Value
  onPick: (value: Value) => void
}): ReactNode {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span className="mr-1 font-medium">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={CHOICE}
          aria-pressed={value === option.value}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The page to try it all by hand, the three choices of the exploration in its toolbar. */
function Page(): ReactNode {
  const [kind, setKind] = useState<Kind>('build')
  const [head, setHead] = useState<HeadPlacement>('page')
  const [opening, setOpening] = useState<Opening>('sheet')
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <div role="toolbar" aria-label="Exploration" className={TOOLBAR}>
          <Choices
            label="Session"
            value={kind}
            onPick={setKind}
            options={[
              { value: 'free', label: 'Free' },
              { value: 'define', label: 'Define' },
              { value: 'build', label: 'Build' },
            ]}
          />
          <Choices
            label="Head line"
            value={head}
            onPick={setHead}
            options={[
              { value: 'page', label: 'A · across the page' },
              { value: 'chat', label: 'B · over the chat' },
            ]}
          />
          <Choices
            label="Helper opens in"
            value={opening}
            onPick={setOpening}
            options={[
              { value: 'sheet', label: 'Sheet under the head' },
              { value: 'dialog', label: 'Dialog' },
              { value: 'side', label: 'Side sheet' },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1">
          <SessionPage key={kind} kind={kind} head={head} opening={opening} />
        </div>
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Build like define/Playground',
  component: Page,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>

export default meta

type Story = StoryObj<typeof meta>

/** Everything live: the kind of Session, where the head line stands, how a helper opens. */
export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('toolbar', { name: 'Exploration' })).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'Build ATL-7' })).toBeVisible()
  },
}
