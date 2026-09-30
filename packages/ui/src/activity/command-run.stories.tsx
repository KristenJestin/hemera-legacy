import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CommandRun } from './command-run.tsx'
import { COMMAND_TYPES } from './command-type.ts'

/**
 * A command Hemera runs for a Session, as the thread reads it (design D6-12, issue #237): one
 * closed, quiet line — the type's icon, the dot, the name, `exit N` once over — whatever the run
 * is doing, and what it ran once opened. No badge, no Stop, no `Add to catalogue`: those are the
 * line's, in the head. An address is a link only once it has answered, and a run shows what it
 * ran — its place, its variables, a port conflict — inside its fold (D8-06, D8-08, D8-09).
 */
const SERVER_OUTPUT = [
  'vite v7.1.4 building for development...',
  '',
  '  Local:   http://localhost:5173/',
  '  press h + enter to show help',
].join('\n')

const CHECK_OUTPUT = [
  '> hemera@0.0.0 check',
  '> pnpm typecheck && pnpm lint && pnpm test',
  '',
  'Test Files  155 passed (155)',
  '     Tests  1192 passed | 2 skipped (1194)',
].join('\n')

const meta = {
  tags: ['autodocs'],
  title: 'Blocks/Activity/CommandRun',
  component: CommandRun,
  parameters: { layout: 'padded' },
  args: {
    name: 'dev',
    command: 'pnpm dev',
    type: 'serve',
    state: 'running',
    folder: 'apps/desktop',
    output: SERVER_OUTPUT,
    url: 'http://localhost:5173/',
    readiness: 'ready',
    onOpenUrl: fn(),
  },
  argTypes: {
    name: { control: 'text', description: 'The name the catalogue keeps it under.' },
    command: { control: 'text', description: 'The command line, as it was run.' },
    type: {
      control: 'select',
      options: COMMAND_TYPES,
      description: 'What the command is for, drawn with its fixed icon (D8-07).',
    },
    state: {
      control: 'inline-radio',
      options: ['running', 'finished', 'failed', 'stopped'],
      description: 'Where the process stands: its dot, and its exit code once over.',
    },
    folder: { control: 'text', description: 'The folder it runs in.' },
    output: { control: 'text', description: 'What it has written so far.' },
    url: { control: 'text', description: 'The address its output named.' },
    readiness: {
      control: 'inline-radio',
      options: ['starting', 'ready', 'unanswered'],
      description: 'Where the address stands: a link only once it has answered (D8-09).',
    },
    environment: { control: 'object', description: 'The variables Hemera gave the run (D8-06).' },
    portConflict: { control: 'object', description: 'The run holding the port it published.' },
    heldAgainst: { control: 'object', description: 'On the holder: the runs that came second.' },
    exitCode: { control: 'number', description: 'What it exited with.' },
    oneOff: { control: 'boolean', description: 'A line run without being in the catalogue.' },
    workspace: {
      control: 'text',
      description: "The Workspace it runs in, when it is not the Session's own (D8-08).",
    },
    onOpenUrl: { control: false, description: 'Opens the published address.' },
  },
} satisfies Meta<typeof CommandRun>

export default meta

type Story = StoryObj<typeof meta>

type StoryContext = Parameters<NonNullable<Story['play']>>[0]

/**
 * One fold, the run's own: its line, and one chevron at the end of it (trial of 23 September
 * 2026). The console inside used to draw a line of its own, so a running `dev` read `dev
 * Running` twice, under two chevrons.
 */
async function oneHeader(canvasElement: HTMLElement, word: string, name?: string): Promise<void> {
  const canvas = within(canvasElement)
  const folds = canvas.queryAllByRole('button', { expanded: true }).length
  const closed = canvas.queryAllByRole('button', { expanded: false }).length
  await expect(folds + closed, 'more than one fold in the run').toBe(1)
  // The name is counted where it is not also the type or the command line.
  if (name !== undefined) await expect(canvas.getAllByText(name, { exact: true })).toHaveLength(1)
  // How it stands is its dot, named by the word, and there is one.
  await expect(canvas.getAllByRole('img', { name: word })).toHaveLength(1)
}

/** Opens the run's line, as a reader does to read what it ran. */
async function open(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  const row = canvas.getByRole('button', { expanded: false })
  await userEvent.click(row)
  await expect(row).toHaveAttribute('aria-expanded', 'true')
}

/**
 * A server that is up: closed like any other line, its address beside its name; opened, the
 * address is the one press that opens it, over what it printed.
 */
export const AppRunning: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await oneHeader(canvasElement, 'Running', 'dev')
    // Closed by default, running or not: the thread says what happened (issue #237).
    await expect(canvas.getByRole('button', { name: /^Running dev/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(canvas.getByText('localhost:5173/')).toBeVisible()
    // Nothing to press on the line but its fold: no Stop beside a thread entry.
    await expect(canvas.queryByRole('button', { name: 'Stop' })).toBeNull()
    await open(canvasElement)
    await expect(canvas.getByText('pnpm dev')).toBeVisible()
    await expect(canvas.getByRole('log', { name: 'Output of dev' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'http://localhost:5173/' }))
    await expect(args.onOpenUrl).toHaveBeenCalledWith('http://localhost:5173/')
  },
}

/**
 * A server whose address has not answered yet: the address is text beside `starting`, and there
 * is nothing to press — a link to a server that is not listening is a link to an error page.
 *
 * Scenario "A URL is ready only after it answers": `AppRunning` is the same run once it has.
 */
async function aUrlIsReadyOnlyAfterItAnswers({ canvasElement }: StoryContext): Promise<void> {
  const canvas = within(canvasElement)
  await open(canvasElement)
  await expect(canvas.getByText('http://localhost:5173/')).toBeVisible()
  await expect(canvas.getByText('starting')).toBeVisible()
  await expect(canvas.queryByRole('button', { name: 'http://localhost:5173/' })).toBeNull()
}

export const AddressStarting: Story = {
  args: { readiness: 'starting' },
  play: aUrlIsReadyOnlyAfterItAnswers,
}

/** A minute without an answer: still starting, and said so, still not a link. */
export const AddressUnanswered: Story = {
  args: { readiness: 'unanswered' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await open(canvasElement)
    await expect(canvas.getByText('no answer after a minute; still starting')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'http://localhost:5173/' })).toBeNull()
  },
}

/**
 * A port another run holds: the conflict names that run and its Workspace, and the holder names
 * the run that came second (D8-09, Decided 12).
 *
 * Scenario "A port conflict names its holder".
 */
async function aPortConflictNamesItsHolder({ canvasElement }: StoryContext): Promise<void> {
  const canvas = within(canvasElement)
  await open(canvasElement)
  await expect(canvas.getByText('Port 5173 is held by dev in main')).toBeVisible()
  await expect(canvas.getByText('Port 5173 is also published by storybook in spike')).toBeVisible()
}

export const PortConflict: Story = {
  args: {
    readiness: 'starting',
    portConflict: { port: 5173, holderRun: 'dev', holderWorkspace: 'main' },
    heldAgainst: [{ port: 5173, run: 'storybook', workspace: 'spike' }],
  },
  play: aPortConflictNamesItsHolder,
}

/**
 * A check that ended, opened: where it ran, the line it ran, the variables Hemera gave it and its
 * output; its exit code on the line (D8-06).
 *
 * Scenario "A run shows what it ran".
 */
async function aRunShowsWhatItRan({ canvasElement }: StoryContext): Promise<void> {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('exit 0')).toBeVisible()
  await userEvent.click(canvas.getByRole('button', { name: /exit 0/ }))
  await expect(canvas.getByText('sources/api')).toBeVisible()
  await expect(canvas.getByText('pnpm vitest run')).toBeVisible()
  const variables = canvas.getByRole('list', { name: 'Variables given' })
  await expect(within(variables).getByText('PORT')).toBeVisible()
  await expect(within(variables).getByText('3001')).toBeVisible()
  // Sorted by key: the eye looks one up, it does not read them in the order they were merged.
  await expect(variables.textContent).toBe('DATABASE_URLpostgres://localhost/atlasPORT3001')
  await expect(canvas.getByText(/12 passed/)).toBeVisible()
}

export const WhatItRan: Story = {
  args: {
    name: 'test',
    command: 'pnpm vitest run',
    type: 'test',
    state: 'finished',
    folder: 'sources/api',
    output: 'Test Files  3 passed (3)\n     Tests  12 passed (12)',
    url: undefined,
    readiness: undefined,
    exitCode: 0,
    environment: { PORT: '3001', DATABASE_URL: 'postgres://localhost/atlas' },
  },
  play: aRunShowsWhatItRan,
}

/** A check that is over: the exit code is read without opening anything. */
export const CheckExitedClean: Story = {
  args: {
    name: 'check',
    command: 'pnpm check',
    type: 'test',
    state: 'finished',
    folder: '.',
    output: CHECK_OUTPUT,
    url: undefined,
    exitCode: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('exit 0')).toBeVisible()
    const row = canvas.getByRole('button', { name: /exit 0/ })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await oneHeader(canvasElement, 'Exited')
    // Opened, the output is right under the run's line: no second fold to open inside it.
    await userEvent.click(row)
    await expect(canvas.getByText(/1192 passed/)).toBeVisible()
    await oneHeader(canvasElement, 'Exited')
  },
}

/**
 * A check that failed (issue #237): closed like the rest, its dot and `exit 1` saying it; the
 * output is there once asked for. It used to open itself on its output, in the way of the thread.
 */
export const CheckFailed: Story = {
  args: {
    name: 'test',
    command: 'pnpm test',
    type: 'test',
    state: 'failed',
    folder: '.',
    output: 'Test Files  1 failed (1)\n      Tests  3 failed (3)',
    url: undefined,
    exitCode: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('exit 1')).toBeVisible()
    await oneHeader(canvasElement, 'Exited', 'test')
    await expect(canvas.getByRole('button', { name: /exit 1/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(canvas.queryByText(/3 failed/)).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: /exit 1/ }))
    await expect(canvas.getByText(/3 failed/)).toBeVisible()
  },
}

/**
 * A one-off line: its name is its line, in the terminal's letters, with no badge; nothing on it
 * keeps it in the catalogue — that is its chip's, in the head (issue #237).
 */
export const OneOff: Story = {
  args: {
    name: 'pnpm drizzle-kit generate',
    command: 'pnpm drizzle-kit generate',
    type: 'script',
    state: 'finished',
    folder: 'apps/desktop',
    output: '1 tables\nproject_commands 1ms',
    url: undefined,
    exitCode: 0,
    oneOff: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('One-off')).toBeNull()
    await expect(canvas.queryByText('Script')).toBeNull()
    await expect(
      getComputedStyle(canvas.getByText(/^pnpm drizzle-kit generate$/)).fontFamily,
    ).toMatch(/mono|Fira/i)
    await userEvent.click(canvas.getByRole('button', { name: /exit 0/ }))
    await expect(canvas.getByText(/project_commands 1ms/)).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Add to catalogue/ })).toBeNull()
    await oneHeader(canvasElement, 'Exited')
  },
}

/**
 * A Project-scoped service asked for from a Session in `login-form`: it runs in `main`, and the
 * run says so where it says where it ran.
 *
 * Scenario "A Project-scoped service is one instance for all": one run, in `main`'s folder.
 */
async function aProjectScopedServiceIsOneInstanceForAll({
  canvasElement,
}: StoryContext): Promise<void> {
  const canvas = within(canvasElement)
  await oneHeader(canvasElement, 'Running', 'auth')
  await open(canvasElement)
  await expect(canvas.getByText('in main')).toBeVisible()
}

export const InAnotherWorkspace: Story = {
  args: {
    name: 'auth',
    command: 'pnpm --filter auth dev',
    folder: 'sources/auth',
    output: '  Local:   http://localhost:4000/',
    url: 'http://localhost:4000/',
    workspace: 'main',
  },
  play: aProjectScopedServiceIsOneInstanceForAll,
}

/** A run in one of the Project's repositories: its mark and its name, not a folder (#239). */
export const InARepository: Story = {
  args: {
    name: 'build',
    command: 'pnpm build',
    repository: { path: 'v2', icon: null },
    folder: '.',
    output: '> v2@0.0.0 build',
  },
  play: async ({ canvasElement }) => {
    await open(canvasElement)
    await expect(within(canvasElement).getByText('v2')).toBeVisible()
  },
}

/** A process the reader stopped: nothing exited, and the line says so. */
export const Stopped: Story = {
  args: {
    name: 'dev',
    state: 'stopped',
    output: `${SERVER_OUTPUT}\n^C`,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Stopped' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^Stopped dev/ }))
    await expect(canvas.getByText(/\^C/)).toBeVisible()
    await oneHeader(canvasElement, 'Stopped', 'dev')
    // The console was released with the process: nothing says it again, not even as "Released".
    await expect(canvas.queryByText('Released')).toBeNull()
  },
}

/** A process that has written nothing yet: the run's line, and an empty log once opened. */
export const Empty: Story = {
  args: { output: '', url: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await oneHeader(canvasElement, 'Running', 'dev')
    await open(canvasElement)
    const log = canvas.getByRole('log', { name: 'Output of dev' })
    await expect(log).toBeInTheDocument()
    await expect(log.textContent).toBe('')
  },
}

/**
 * A check that runs, then exits with the code it is told: the line, and the button that ends it,
 * as a Session would.
 */
function EndingRun({ exitCode }: { exitCode: number }): ReactNode {
  const [over, setOver] = useState(false)
  const failed = exitCode !== 0
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => setOver(true)}>
        End the run
      </button>
      <CommandRun
        name="check"
        command="pnpm check"
        type="test"
        state={over ? (failed ? 'failed' : 'finished') : 'running'}
        folder="."
        output={over ? (failed ? 'Tests  3 failed (3)' : 'Tests  3 passed (3)') : 'Running...'}
        exitCode={over ? exitCode : undefined}
      />
    </div>
  )
}

/**
 * A run that ends stays as the reader left it (issue #237): closed while it ran, closed once it
 * failed, its dot and its exit code saying how it ended; opened while it ran, still open.
 */
export const ARunThatEndsStaysAsLeft: Story = {
  render: () => <EndingRun exitCode={1} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('button', { name: /^Running check/ })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(canvas.getByRole('button', { name: 'End the run' }))
    await expect(canvas.getByText('exit 1')).toBeVisible()
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText(/3 failed/)).toBeVisible()
  },
}
