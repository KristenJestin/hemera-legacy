import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import type { Grouping } from './build-tasks.tsx'
import { DEFINE_HELPERS, FREE_HELPERS, HELPERS, type Helper, STUCK } from './fixtures.ts'
import type { Opening } from './helper-viewer.tsx'
import { type HeadPlacement, type Kind, SessionPage } from './page.tsx'

/**
 * The exploration of issue #77 as one page to try by hand (30 September 2026). Storybook's own
 * Controls pick the kind of Session — `free`, `define`, `build` — where the head line stands (A
 * across the page, B over the chat only), how a helper's thread opens (a sheet under the head
 * line, a dialog, a side sheet), how the build's tasks are grouped, and whether the panel starts
 * folded or over the chat and a helper is stuck. The page shows the app and nothing else, and
 * everything in it stays live: the fold, the panel over the chat, the run and helper chips, the
 * notices and their answer, the tasks and their detail. Light and dark through Storybook's
 * toolbar. The moments, one story each, are in `Screens`.
 */

interface PlaygroundArgs {
  kind: Kind
  head: HeadPlacement
  helperOpening: Opening
  taskGrouping: Grouping
  folded: boolean
  over: boolean
  stuck: boolean
}

/** The kind's helpers, the first one silent when a stuck helper is asked for. */
function helpersOf(kind: Kind, stuck: boolean): readonly Helper[] {
  if (kind === 'build') return stuck ? STUCK : HELPERS
  const helpers = kind === 'free' ? FREE_HELPERS : DEFINE_HELPERS
  const [first, ...rest] = helpers
  if (!stuck || first === undefined) return helpers
  const silent: Helper = { ...first, state: 'stuck' }
  return [silent, ...rest]
}

function Page({
  kind,
  head,
  helperOpening,
  taskGrouping,
  folded,
  over,
  stuck,
}: PlaygroundArgs): ReactNode {
  return (
    <TooltipProvider>
      <div className="h-screen">
        {/* What the page starts from is drawn again when a control changes it; where the head
            line stands and how a helper opens are read live. */}
        <SessionPage
          key={[kind, taskGrouping, folded, over, stuck].join(':')}
          kind={kind}
          head={head}
          opening={helperOpening}
          helpers={helpersOf(kind, stuck)}
          defaultGrouping={taskGrouping}
          defaultFolded={folded}
          defaultOver={over}
        />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Build like define/Playground',
  component: Page,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    kind: 'build',
    head: 'page',
    helperOpening: 'sheet',
    taskGrouping: 'story',
    folded: false,
    over: false,
    stuck: true,
  },
  argTypes: {
    kind: {
      description: 'The kind of Session',
      control: { type: 'inline-radio', labels: { free: 'Free', define: 'Define', build: 'Build' } },
      options: ['free', 'define', 'build'],
    },
    head: {
      description: 'Where the head line stands',
      control: {
        type: 'inline-radio',
        labels: { page: 'A · across the page', chat: 'B · over the chat' },
      },
      options: ['page', 'chat'],
    },
    helperOpening: {
      description: 'How a helper’s thread opens',
      control: {
        type: 'inline-radio',
        labels: { sheet: 'Sheet under the head', dialog: 'Dialog', side: 'Side sheet' },
      },
      options: ['sheet', 'dialog', 'side'],
    },
    taskGrouping: {
      description: 'How the build’s tasks are grouped',
      control: {
        type: 'inline-radio',
        labels: { story: 'By story', list: 'One list', state: 'By state' },
      },
      options: ['story', 'list', 'state'],
    },
    folded: { description: 'The panel folded to its small frame', control: 'boolean' },
    over: { description: 'The panel over the chat', control: 'boolean' },
    stuck: { description: 'A helper silent for too long', control: 'boolean' },
  },
} satisfies Meta<typeof Page>

export default meta

type Story = StoryObj<typeof meta>

/** Everything live: the Controls pick the Session and its choices, the page does the rest. */
export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Build ATL-7' })).toBeVisible()
    await expect(canvas.queryByRole('toolbar')).toBeNull()
  },
}
