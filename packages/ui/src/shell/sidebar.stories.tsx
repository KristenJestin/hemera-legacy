import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { expectNeverBuried, watchThereAndBack } from '../../.storybook/sliding-mark.ts'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { JOURNAL_ENTRY, SIDEBAR_DEFAULT, type ShellSession } from './model.ts'
import { Sidebar } from './sidebar.tsx'

const SESSIONS: ShellSession[] = [
  { id: 'csv', title: 'CSV invoice export' },
  { id: 'search', title: 'Full-text search' },
  { id: 'drizzle', title: 'Migrate to Drizzle 1.0' },
]

/** Sessions whose agents are each doing something else, as the application hands them over. */
const AT_WORK: ShellSession[] = [
  { id: 'csv', title: 'CSV invoice export', agent: 'writing' },
  { id: 'search', title: 'Full-text search', agent: 'question' },
  { id: 'drizzle', title: 'Migrate to Drizzle 1.0', agent: 'permission' },
  { id: 'tests', title: 'Flaky export tests', agent: 'running' },
  { id: 'docs', title: 'Read the API docs', agent: 'reading' },
  { id: 'lint', title: 'Lint the renderer', agent: 'thinking' },
  { id: 'bump', title: 'Bump Electron', agent: 'error' },
  { id: 'notes', title: 'Release notes' },
]

interface HarnessProps {
  collapsed?: boolean
  sessions?: ShellSession[]
  /** Whether the window is on the settings of the application, which are not one of the entries. */
  settingsActive?: boolean
}

function Harness({ collapsed = false, sessions = SESSIONS, settingsActive = false }: HarnessProps) {
  const [activeEntryId, setActiveEntryId] = useState(sessions[0]?.id ?? JOURNAL_ENTRY)
  return (
    <TooltipProvider>
      <div className="flex h-screen">
        <Sidebar
          collapsed={collapsed}
          width={SIDEBAR_DEFAULT}
          dragging={false}
          onWidth={() => undefined}
          sessions={sessions}
          activeEntryId={settingsActive ? null : activeEntryId}
          onSelectEntry={setActiveEntryId}
          onNewSession={fn()}
          onRenameSession={fn()}
          onArchiveSession={fn()}
          onOpenCommand={fn()}
          commandShortcut="Ctrl+K"
          onOpenSettings={fn()}
          settingsActive={settingsActive}
        />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Shell/Sidebar',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  argTypes: { sessions: { table: { disable: true } } },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  // The controls belong to the playground: this story decides these props itself, and a panel
  // offering to change them would only be offering something that does not happen.
  parameters: { controls: { disable: true } },
  args: { collapsed: true },
}

export const States: Story = {
  // The controls belong to the playground: this story decides these props itself, and a panel
  // offering to change them would only be offering something that does not happen.
  parameters: { controls: { disable: true } },
  args: { sessions: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The places of the product, in the order the core puts them, and nothing beside them.
    expect(canvas.getByRole('button', { name: 'Command' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Journal' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Project settings' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    // The keystroke that opens the command is drawn beside it, as keys.
    expect(canvas.getByText('Ctrl')).toBeInTheDocument()
    // A Project with no Session says so in words, and the way to make one is the `+` in the head
    // of the list — the same control in the same place, whether the list is empty or full.
    expect(canvas.getByText('No Session yet')).toBeInTheDocument()
    expect(canvas.getAllByRole('button', { name: 'New Session' })).toHaveLength(1)
    // Both blocks of the column are named, and named the same way: the two places below the list
    // are a section of their own rather than what the Sessions ran into.
    expect(canvas.getByText('Sessions')).toBeInTheDocument()
    expect(canvas.getByText('Project')).toBeInTheDocument()
    // Three blocks in the column — the places, the Sessions, the rest of the places — and a
    // rule between them, so a list under a label is not read as part of what came before it.
    expect(canvasElement.querySelectorAll('[data-separator]')).toHaveLength(3)
  },
}

/**
 * What a row of the list carries: the two commands of a Session, drawn under the hand.
 *
 * A Session is renamed and put away from its own row, and the Journal is not: it is a place
 * rather than something somebody wrote, and nothing of it is renamed or archived. The commands
 * are drawn over the end of the row instead of beside it, so the title does not shorten the
 * moment the pointer arrives.
 */
export const Commands: Story = {
  // The controls belong to the playground: this story decides these props itself, and a panel
  // offering to change them would only be offering something that does not happen.
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Rename CSV invoice export' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Archive CSV invoice export' })).toBeInTheDocument()
    // The Journal is a place and not a Session: nothing of its own to rename or to put away.
    expect(canvas.queryByRole('button', { name: 'Rename Journal' })).toBeNull()
  },
}

/**
 * On the settings of the application: the foot of the panel is the one thing marked.
 *
 * The entry the window was on before is not where it is now, and a panel marking both is a
 * panel saying the window is in two places at once.
 */
export const OnTheSettings: Story = {
  // The controls belong to the playground: this story decides these props itself, and a panel
  // offering to change them would only be offering something that does not happen.
  parameters: { controls: { disable: true } },
  args: { settingsActive: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const marked = canvas
      .getAllByRole('button')
      .filter((one) => one.getAttribute('aria-current') === 'true')

    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveAccessibleName('Settings')
  },
}

/**
 * The panel's mark crossing it, down from the first Session to the Project settings and back up
 * again: on every frame of the way it is drawn over the rows it crosses — the Sessions, the
 * Journal — and never under one (issue #127). The way up is where a mark drawn inside its row
 * went under the rows drawn after it.
 */
export const MarkCrossing: Story = {
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = canvas.getByRole('complementary', { name: /Sessions and places/ })
    const watched = await watchThereAndBack(
      panel,
      () => userEvent.click(canvas.getByRole('button', { name: 'Project settings' })),
      () => userEvent.click(canvas.getByRole('button', { name: 'CSV invoice export' })),
    )
    expect(canvas.getByRole('button', { name: 'CSV invoice export' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expectNeverBuried(watched)
  },
}

/**
 * Each Session wears what its agent is doing (issue #140): at work, asking for an answer or a
 * permission, failed, or asleep while nothing runs — the one that wants the reader is found at a
 * glance, by its face rather than by its words.
 */
export const AgentsAtWork: Story = {
  parameters: { controls: { disable: true } },
  args: { sessions: AT_WORK },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const worn = AT_WORK.map((session) =>
      canvas.getByRole('button', { name: session.title }).querySelector('[data-state]'),
    ).map((face) => face?.getAttribute('data-state'))
    await expect(worn).toEqual(AT_WORK.map((session) => session.agent ?? 'asleep'))
  },
}

/** Folded to the rail, the faces are what is left of the rows, and still say who wants the reader. */
export const AgentsOnTheRail: Story = {
  parameters: { controls: { disable: true } },
  args: { sessions: AT_WORK, collapsed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const asking = canvas.getByRole('button', { name: 'Full-text search' })
    await expect(asking.querySelector('[data-state]')).toHaveAttribute('data-state', 'question')
    await expect(asking.querySelector('[data-state]')).toBeVisible()
  },
}
