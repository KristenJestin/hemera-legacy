import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { DiffBlock } from '../activity/diff-block.tsx'
import { PermissionRecord, PermissionRequest } from './permission-request.tsx'

/**
 * The gate at the size of a thread.
 *
 * The card is drawn where it will be read: in a column, with the change it is guarding under it.
 */
const meta = {
  title: 'Blocks/Session/PermissionRequest',
  component: PermissionRequest,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'padded' },
  args: {
    toolName: 'Edit',
    intent: 'Change the two lines that decide whether a stopped turn is written to the log.',
    options: [
      { optionId: 'once', kind: 'allow_once', name: 'Allow once' },
      { optionId: 'always', kind: 'allow_always', name: 'Always allow edits' },
      { optionId: 'no', kind: 'reject_once', name: 'Reject once' },
    ],
    scope: 'this session',
    onDecide: fn(),
  },
  argTypes: {
    toolName: { control: 'text', description: 'The tool the agent wants to use.' },
    label: { control: 'text', description: 'What a reader calls the tool, as its line says it.' },
    subject: { control: 'text', description: 'What the call is about: the path, the command.' },
    intent: { control: 'text', description: 'What the call would do, in one sentence.' },
    options: { control: 'object', description: 'What the agent offers; never invented here.' },
    scope: { control: 'text', description: 'How long an “always” answer is remembered.' },
    onDecide: { description: 'Called with the option the reader pressed, and with nothing else.' },
  },
} satisfies Meta<typeof PermissionRequest>

export default meta

type Story = StoryObj<typeof meta>

/** A change about to be made, with the parameters that decide the answer. */
export const AskForAnEdit: Story = {
  args: {
    parameters: [
      { label: 'file', value: 'packages/ui/src/session/stopped-turn.tsx' },
      { label: 'replace', value: 'one line' },
    ],
  },
}

/** The card carries the change of the file it is guarding, so the answer is given on the
 * evidence rather than on the agent's word. */
export const WithTheChange: Story = {
  args: {
    parameters: [{ label: 'file', value: 'packages/ui/src/session/plan-panel.tsx' }],
    diff: (
      <DiffBlock
        defaultOpen
        path="packages/ui/src/session/plan-panel.tsx"
        oldText={'if (turn.stopped) {\n  return null\n}\n'}
        newText={'if (turn.stopped) {\n  return <StoppedTurn reason={turn.reason} />\n}\n'}
      />
    ),
  },
}

/** Nothing is offered that the agent did not offer: two options, two buttons. */
export const NothingButACommand: Story = {
  args: {
    toolName: 'Bash',
    intent: 'Run the test suite of the design system once, without watching it.',
    command: 'pnpm --filter @hemera/ui test --run',
    options: [
      { optionId: '', kind: 'allow_once', name: '' },
      { optionId: 'no', kind: 'reject_once', name: '' },
    ],
    scope: undefined,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The agent sent no name, so the kind's own word is used rather than an empty button.
    await expect(canvas.getByRole('button', { name: 'Allow once' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Reject once' })).toBeVisible()
    // No standing answer was offered, so nothing promises to remember one.
    await expect(canvas.getByRole('button', { name: 'Allow once' })).not.toHaveAttribute('title')
    canvas.getByRole('button', { name: 'Allow once' }).click()
    await expect(args.onDecide).toHaveBeenCalledWith({
      optionId: '',
      kind: 'allow_once',
      name: '',
    })
  },
}

/**
 * The answers stand where every notice has them (review of #250): the refusal first and quiet, the
 * one-shot permission last and primary, and a standing rule between the two, with how long it is
 * remembered said on it — whatever order the agent sent them in.
 */
export const OrderedByRisk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const buttons = canvas.getAllByRole('button')
    await expect(buttons[0]).toHaveTextContent('Reject once')
    await expect(buttons[1]).toHaveTextContent('Always allow edits (this session)')
    await expect(buttons[2]).toHaveTextContent('Allow once')
  },
}

/** Tab walks the answers in the order they are read, and Enter presses the focused one. */
export const AnsweredByKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const refusal = canvas.getByRole('button', { name: 'Reject once' })
    refusal.focus()
    await expect(refusal).toHaveFocus()

    await userEvent.tab()
    const standing = canvas.getByRole('button', { name: 'Always allow edits (this session)' })
    await expect(standing).toHaveFocus()

    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Allow once' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect(args.onDecide).toHaveBeenCalledWith({
      optionId: 'once',
      kind: 'allow_once',
      name: 'Allow once',
    })
  },
}

/** Escape takes the refusal, and the refusal only: it never answers with a permission. */
export const EscapeRefuses: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('button', { name: 'Allow once' }).focus()

    await userEvent.keyboard('{Escape}')
    await expect(args.onDecide).toHaveBeenCalledWith({
      optionId: 'no',
      kind: 'reject_once',
      name: 'Reject once',
    })
  },
}

/** An agent that never sent a refusal cannot be refused from here. */
export const NothingToRefuseWith: Story = {
  args: {
    options: [{ optionId: 'once', kind: 'allow_once', name: 'Allow once' }],
    scope: undefined,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('button', { name: 'Allow once' }).focus()

    await userEvent.keyboard('{Escape}')
    await expect(args.onDecide).not.toHaveBeenCalled()
  },
}

/**
 * One of Hemera's own tools asking before it acts outside the Workspace root (design D6-05).
 *
 * The same block as the agent's own questions, drawn from the place the path resolves to and the
 * root it leaves: two options, for this call only, because nothing is remembered and there is no
 * "always" to give. The head reads the way the call's line does (recette 3 of 23 September 2026):
 * the label, the path as the agent named it, and what it asks.
 */
export const HemeraToolOutsideTheRoot: Story = {
  args: {
    toolName: 'fs_write',
    label: 'Write file',
    subject: '../notes/todo.md',
    intent: 'asks to act outside the Workspace',
    // The path is what the card is about, so it is not said a second time as a parameter.
    parameters: [{ label: 'Outside the Workspace', value: 'main' }],
    command: '/home/ana/notes/todo.md',
    options: [
      { optionId: 'allowed', kind: 'allow_once', name: 'Allow once' },
      { optionId: 'refused', kind: 'reject_once', name: 'Refuse' },
    ],
    // Nothing is remembered, so there is no "always" and no time it would be remembered for.
    scope: undefined,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The head is what accepting does; what it is about is under it (#237, review of #250).
    const head = canvas.getByText('Write file').parentElement
    await expect(head?.textContent).toBe('Write file')
    await expect(canvas.queryByText('fs_write')).toBeNull()
    await expect(getComputedStyle(canvas.getByText('../notes/todo.md')).fontFamily).toMatch(
      /mono|Fira/i,
    )
    await expect(canvas.getByRole('group', { name: 'Permission for Write file' })).toBeVisible()
    await expect(canvas.getAllByText('/home/ana/notes/todo.md')).toHaveLength(1)
    // No "always": the two answers are about this call.
    await expect(canvas.queryByText(/always/i)).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Allow once' }))
    await expect(args.onDecide).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: 'allowed' }),
    )
  },
}

/**
 * An agent's own question, headed by the line of the call it is about (recette 3 of
 * 23 September 2026): the label of the call's kind and the file it would change.
 */
export const AgentCallWithItsSubject: Story = {
  args: {
    toolName: 'Edit session.tsx',
    label: 'Edit file',
    subject: 'src/session/session.tsx',
    intent: 'asks for your permission',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Edit file')).toBeVisible()
    await expect(canvas.getByText('src/session/session.tsx')).toBeVisible()
    // What it asks is what the card is: no sentence says it again (#237).
    await expect(canvas.queryByText('asks for your permission')).toBeNull()
    await expect(canvas.queryByText('Edit session.tsx')).toBeNull()
  },
}

/** The two answers of a question of Hemera's own tools: this call only, nothing remembered. */
const ONCE = [
  { optionId: 'allowed', kind: 'allow_once' as const, name: 'Allow once' },
  { optionId: 'refused', kind: 'reject_once' as const, name: 'Refuse' },
]

/**
 * A one-off in the Workspace (issue #239): asked about because the agent wrote the line, which the
 * head says, and said to run in the Workspace — nothing about it is outside anything.
 */
export const OneOffInside: Story = {
  args: {
    toolName: 'commands_run',
    label: 'Run command',
    subject: 'sleep 120',
    intent: 'asks to run a line the agent wrote',
    parameters: [{ label: 'In', value: 'main' }],
    command: 'sleep 120',
    options: ONCE,
    scope: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/asks to/)).toBeNull()
    await expect(canvas.getByText('In')).toBeVisible()
    await expect(canvas.getByText('main')).toBeVisible()
    await expect(canvas.queryByText(/outside/i)).toBeNull()
    await expect(canvas.queryByText(/resolved/i)).toBeNull()
  },
}

/** A one-off in one of the Project's repositories: the repository with its mark, then the path. */
export const OneOffInARepository: Story = {
  args: {
    ...OneOffInside.args,
    parameters: [
      { label: 'In', value: 'v2', repository: { path: 'v2', icon: 'server' } },
      { label: 'Path', value: 'scripts' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const repository = canvas.getByText('v2').closest('dd')
    // The repository wears its icon, as it does in the Project's settings.
    await expect(repository?.querySelector('svg')).not.toBeNull()
    await expect(canvas.getByText('scripts')).toBeVisible()
    await expect(canvas.queryByText(/outside/i)).toBeNull()
  },
}

/** A one-off the engine found outside the Workspace: said so, and where it would run. */
export const OneOffOutside: Story = {
  args: {
    ...OneOffInside.args,
    intent: 'asks to run a line the agent wrote, outside the Workspace',
    parameters: [
      { label: 'Outside the Workspace', value: 'main' },
      { label: 'Path', value: '/home/ana/notes' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Outside the Workspace')).toBeVisible()
    await expect(canvas.getByText('/home/ana/notes')).toBeVisible()
  },
}

/**
 * A one-off whose line is longer than the card (issue #237): the whole line, wrapped in the
 * terminal's letters rather than cut, where it would run, and the two answers — said once each,
 * with no badge, no heading and no sentence around them.
 */
export const TheWholeLine: Story = {
  args: {
    toolName: 'commands_run',
    label: 'Run command',
    subject:
      'pnpm --filter @atlas/api vitest run src/invoices/csv.stream.spec.ts --reporter=verbose --coverage.enabled=false',
    intent: 'asks to run a line the agent wrote',
    parameters: [{ label: 'In', value: 'api', repository: { path: 'api', icon: 'server' } }],
    command:
      'pnpm --filter @atlas/api vitest run src/invoices/csv.stream.spec.ts --reporter=verbose --coverage.enabled=false',
    options: ONCE,
    scope: undefined,
  },
  decorators: [
    (Story) => (
      <div className="w-notices">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByText(args.command ?? '')
    // Whole: wrapped over several rows, nothing scrolled or cut.
    await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth)
    await expect(line.getBoundingClientRect().height).toBeGreaterThan(20)
    // Said once: the line is not on the head too.
    await expect(canvas.getAllByText(args.command ?? '')).toHaveLength(1)
    await expect(canvas.queryByText(/Waiting/)).toBeNull()
    await expect(canvas.queryByText(/asks/)).toBeNull()
    await expect(canvas.getByText('api')).toBeVisible()
    const answers = canvas.getAllByRole('button').map((one) => one.textContent)
    await expect(answers).toEqual(['Refuse', 'Allow once'])
  },
}

/**
 * What the thread keeps of a permission answered among the Session's notices (issue #237): one
 * closed line — the shield, the dot of the answer, the call and its line — and, opened, where it
 * ran, the whole line and the answer with its time. Nothing in it to press.
 */
export const KeptAllowed: Story = {
  render: () => (
    <PermissionRecord
      toolName="commands_run"
      label="Run command"
      subject="sleep 120"
      parameters={[{ label: 'In', value: 'main' }]}
      command="sleep 120"
      standing="allowed"
      decision={{ answer: 'Allow once', at: '10:42' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const record = canvas.getByRole('group', { name: 'Permission for Run command, allowed' })
    await expect(within(record).getByText('sleep 120')).toBeVisible()
    await expect(within(record).queryByRole('button', { name: 'Allow once' })).toBeNull()
    await userEvent.click(within(record).getByRole('button'))
    await expect(await within(record).findByText('10:42')).toBeVisible()
    await expect(within(record).getByText('main')).toBeVisible()
  },
}

/** Still waiting: the same line, its dot waiting; the answer is given in the notices. */
export const KeptWaiting: Story = {
  render: () => (
    <PermissionRecord
      toolName="commands_run"
      label="Run command"
      subject="sleep 120"
      command="sleep 120"
      standing="pending"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('group', { name: 'Permission for Run command, waiting' }),
    ).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Allow|Refuse/ })).toBeNull()
  },
}
