import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CommandsPanel, type CommandPanelRun } from './commands-panel.tsx'

/**
 * The commands of a Session (design D6-12).
 *
 * The stories are what the panel is for: an application the agent started, still up, with its
 * address one press away; a check that is over; a one-off line the reader types; and a Session
 * that has run nothing. Whoever started the command, it is watched from here.
 */
const SERVER: CommandPanelRun = {
  id: 'run-dev',
  name: 'dev',
  command: 'pnpm dev',
  type: 'serve',
  state: 'running',
  folder: 'apps/desktop',
  output: 'vite v7.1.4\n\n  Local:   http://localhost:5173/',
  url: 'http://localhost:5173/',
  readiness: 'ready',
}

const CHECK: CommandPanelRun = {
  id: 'run-check',
  name: 'check',
  command: 'pnpm check',
  type: 'test',
  state: 'finished',
  folder: '.',
  output: 'Test Files  155 passed (155)',
  exitCode: 0,
}

const meta = {
  tags: ['autodocs', 'updated'],
  title: 'Blocks/Session/CommandsPanel',
  component: CommandsPanel,
  parameters: { layout: 'padded' },
  args: {
    runs: [SERVER, CHECK],
    onStop: fn(),
    onOpenUrl: fn(),
    onRun: fn(),
  },
  argTypes: {
    runs: { control: 'object', description: 'The runs of this Session, oldest first.' },
    onStop: { control: false, description: 'Stops one of them.' },
    onOpenUrl: { control: false, description: 'Opens the address a run published.' },
    onRun: { control: false, description: 'Runs a one-off line inside the Workspace root.' },
  },
} satisfies Meta<typeof CommandsPanel>

export default meta

type Story = StoryObj<typeof meta>
type Context = Parameters<NonNullable<Story['play']>>[0]

/** A server the agent started, still up: the count is what the reader came for. */
export const AppRunning: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 running')).toBeVisible()
    await expect(canvas.getAllByText('dev').length).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole('button', { name: 'http://localhost:5173/' }))
    await expect(args.onOpenUrl).toHaveBeenCalledWith('http://localhost:5173/')
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledWith('run-dev')
  },
}

/** A one-off line: it runs, it shows here, and nothing promotes it to the catalogue. */
export const OneOffLine: Story = {
  args: { runs: [CHECK] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByLabelText('Run a line')
    await userEvent.type(line, 'pnpm drizzle-kit generate')
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }))
    await expect(args.onRun).toHaveBeenCalledWith('pnpm drizzle-kit generate')
    // The line is spent once it is run: what is in the box is a command that has not run yet.
    await expect(line).toHaveValue('')
  },
}

/** A Session that has run nothing: the panel says so, and offers the line anyway. */
export const Empty: Story = {
  args: { runs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No command has run in this Session.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Run' })).toBeDisabled()
  },
}

/** A process the reader stopped under the agent: it is over, and the line says how. */
export const Stopped: Story = {
  args: {
    runs: [{ ...SERVER, state: 'stopped', output: 'vite v7.1.4\n^C' }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Stopped')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Stop' })).toBeNull()
  },
}

/** The Project's catalogue: `test` has not run, `dev` is running in this Session. */
const CATALOGUE = [
  { name: 'test', line: 'bun run test' },
  { name: 'dev', line: 'pnpm dev' },
]

// Scenario "A configured command can be found and run" (#217).
async function aConfiguredCommandCanBeFoundAndRun({ canvasElement, args }: Context) {
  const canvas = within(canvasElement)
  const catalogue = canvas.getByRole('list', { name: 'Catalogue' })
  const rows = within(catalogue).getAllByRole('listitem')
  await expect(rows).toHaveLength(2)
  await expect(within(rows[0]!).getByText('bun run test')).toBeVisible()

  // Each command of the catalogue runs from its row, by its name.
  await userEvent.click(canvas.getByRole('button', { name: 'Run test' }))
  await expect(args.onRunCommand).toHaveBeenCalledWith('test')

  // One running in this Session offers Stop in its place, which stops that run.
  await expect(canvas.queryByRole('button', { name: 'Run dev' })).toBeNull()
  await userEvent.click(canvas.getByRole('button', { name: 'Stop dev' }))
  await expect(args.onStop).toHaveBeenCalledWith('run-dev')

  // The catalogue comes before the free line for a one-off.
  const line = canvas.getByLabelText('Run a line')
  await expect(
    catalogue.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
}

/** The catalogue as rows, each with its Run, and Stop on the one running. */
export const Catalogue: Story = {
  args: { runs: [SERVER], catalogue: CATALOGUE, onRunCommand: fn() },
  play: aConfiguredCommandCanBeFoundAndRun,
}

/** A Project with no command kept yet: the panel says where one is added. */
export const NoCatalogue: Story = {
  args: { runs: [], catalogue: [], onRunCommand: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText("No command in the catalogue. Add one in the Project's settings."),
    ).toBeVisible()
  },
}

/** The Workspace's services, with their state and address, in the same place. */
export const Services: Story = {
  args: {
    runs: [],
    catalogue: CATALOGUE,
    onRunCommand: fn(),
    services: [
      {
        id: 'run-dev',
        name: 'dev',
        workspace: 'hem-7-login-form',
        folder: 'apps/desktop',
        scope: 'workspace',
        state: 'running',
        url: 'http://localhost:5173/',
        readiness: 'ready',
        startedBy: 'agent',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const services = within(canvas.getByRole('list', { name: 'Services' }))
    await expect(services.getByText('dev')).toBeVisible()
    await expect(services.getByText('Running')).toBeVisible()
    await expect(services.getByRole('button', { name: 'http://localhost:5173/' })).toBeVisible()
  },
}
