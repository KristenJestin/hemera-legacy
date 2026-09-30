import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import {
  type DecisionLine,
  DeveloperSection,
  type DeveloperSectionProps,
} from './developer-section.tsx'

/**
 * What Hemera does behind the scenes, one card per panel (#294): Hemera Auto's latest decisions
 * across every Session, and the diagnostics that moved here from the Profile.
 */
const RECORD = (fields: object) => JSON.stringify(fields, null, 2)

const ALLOWED_BY_RULES: DecisionLine = {
  id: 'd1',
  at: '14:32:08',
  sessionId: 's-parser',
  session: 'Fix the parser',
  tool: 'fs_write',
  call: 'src/parser.ts',
  by: 'rules',
  verdict: 'allowed',
  record: RECORD({ tool: 'fs_write', answer: 'allowed', by: 'rules', policyVersion: 3 }),
}

const ALLOWED_BY_JUDGE: DecisionLine = {
  id: 'd2',
  at: '14:31:40',
  sessionId: 's-parser',
  session: 'Fix the parser',
  tool: 'commands_run',
  call: 'pnpm test --filter parser',
  by: 'judge',
  verdict: 'allowed',
  scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
  model: 'jev-1',
  roundTripMs: 820,
  record: RECORD({
    tool: 'commands_run',
    answer: 'allowed',
    by: 'judge',
    model: 'jev-1',
    scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
  }),
}

const REFUSED_BY_JUDGE: DecisionLine = {
  id: 'd3',
  at: '14:30:12',
  sessionId: 's-deploy',
  session: 'Deploy the preview',
  tool: 'commands_run',
  call: 'curl -H "Authorization: [REDACTED]" https://example.com/deploy',
  by: 'judge',
  verdict: 'refused',
  scores: { risk: 4, approval: 0.9, userRequested: 0.1 },
  model: 'jev-1',
  roundTripMs: 1240,
  record: RECORD({ tool: 'commands_run', answer: 'refused', by: 'judge', model: 'jev-1' }),
}

/** Jev did not answer in time: nobody settled it, and the human was asked. */
const TIMED_OUT: DecisionLine = {
  id: 'd4',
  at: '14:29:55',
  sessionId: 's-deploy',
  session: 'Deploy the preview',
  tool: 'fs_edit',
  call: 'deploy/preview.yml',
  by: 'human',
  judged: 'nobody',
  verdict: 'allowed',
  roundTripMs: 10000,
  record: RECORD({ tool: 'fs_edit', answer: 'allowed', by: 'human', judged: 'nobody' }),
}

const EXPIRED: DecisionLine = {
  id: 'd5',
  at: '14:28:01',
  sessionId: 's-parser',
  session: 'Fix the parser',
  tool: 'fs_write',
  call: 'src/lexer.ts',
  by: 'expired',
  verdict: 'refused',
  record: RECORD({ tool: 'fs_write', answer: 'refused', by: 'expired' }),
}

const DECISIONS = [ALLOWED_BY_RULES, ALLOWED_BY_JUDGE, REFUSED_BY_JUDGE, TIMED_OUT, EXPIRED]

function Controlled({ acpTrace, onAcpTraceChange, ...rest }: DeveloperSectionProps) {
  const [tracing, setTracing] = useState(acpTrace ?? false)
  return (
    <DeveloperSection
      {...rest}
      acpTrace={tracing}
      onAcpTraceChange={(on) => {
        setTracing(on)
        onAcpTraceChange?.(on)
      }}
    />
  )
}

const meta = {
  title: 'Surfaces/Settings/Developer',
  component: DeveloperSection,
  tags: ['autodocs', 'new'],
  render: (args) => <Controlled {...args} />,
  parameters: { layout: 'padded' },
  args: {
    decisions: DECISIONS,
    onOpenSession: fn(),
    acpTrace: false,
    onAcpTraceChange: fn(),
    onOpenDiagnostic: fn(),
  },
  argTypes: {
    decisions: { control: 'object', description: 'The latest decisions, newest first.' },
    onOpenSession: { action: 'session opened' },
    acpTrace: { control: 'boolean', description: 'Whether the ACP trace is written.' },
    onAcpTraceChange: { action: 'trace turned on or off' },
    onOpenDiagnostic: { action: 'diagnostic opened' },
  },
} satisfies Meta<typeof DeveloperSection>

export default meta
type Story = StoryObj<typeof meta>

function decisionsIn(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole('list', { name: 'Hemera Auto decisions' }))
}

/**
 * The decisions, newest first, each on one row: when, which Session, the call, who decided as an
 * icon, the verdict as a dot, and the judge's scores, model and round trip where it answered.
 */
export const WithDecisions: Story = {
  play: async ({ canvasElement }) => {
    const rows = decisionsIn(canvasElement).getAllByRole('listitem')
    await expect(rows).toHaveLength(5)
    const first = within(rows[0]!)
    await expect(first.getByText('14:32:08')).toBeVisible()
    await expect(first.getByRole('button', { name: 'Fix the parser' })).toBeVisible()
    await expect(first.getByText('src/parser.ts')).toBeVisible()
    await expect(first.getByRole('img', { name: 'Decided by the rules' })).toBeVisible()
    await expect(first.getByRole('img', { name: 'Allowed' })).toBeVisible()
    const judged = within(rows[1]!)
    await expect(judged.getByRole('img', { name: 'Decided by the judge' })).toBeVisible()
    await expect(judged.getByText('pnpm test --filter parser')).toBeVisible()
    await expect(judged.getByLabelText('risk 1, approval 0.2, user-requested 0.9')).toBeVisible()
    await expect(judged.getByText('jev-1 · 820 ms')).toBeVisible()
    // States are icons and dots: no word badge says them.
    const canvas = within(canvasElement)
    for (const word of ['Allowed', 'Refused', 'rules', 'judge', 'human']) {
      expect(canvas.queryByText(word)).toBeNull()
    }
  },
}

/** No decision was taken yet: the panel says so, and the diagnostics are still there. */
export const NoDecisions: Story = {
  args: { decisions: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No decision yet.')).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: /Write an ACP trace of each Session/ }),
    ).toBeVisible()
  },
}

/** Before the engine has answered, the panel says so rather than claiming there is none. */
export const NotReadYet: Story = {
  args: { decisions: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Hemera Auto decisions cannot be read yet.'),
    ).toBeVisible()
  },
}

/** A refusal is a red dot, and its row opens on the whole decision record. */
export const Refused: Story = {
  args: { decisions: [REFUSED_BY_JUDGE] },
  play: async ({ canvasElement }) => {
    const row = within(decisionsIn(canvasElement).getByRole('listitem'))
    await expect(row.getByRole('img', { name: 'Refused' })).toBeVisible()
    await expect(row.getByText(/Authorization: \[REDACTED\]/)).toBeVisible()
    const fold = row.getByRole('button', { name: /Details of the decision/ })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(fold)
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await expect(await within(canvasElement).findByLabelText('Decision record')).toHaveTextContent(
      '"answer": "refused"',
    )
  },
}

/** Jev did not answer in time: nobody settled it, the human decided, and the round trip says why. */
export const Timeout: Story = {
  args: { decisions: [TIMED_OUT] },
  play: async ({ canvasElement }) => {
    const row = within(decisionsIn(canvasElement).getByRole('listitem'))
    await expect(
      row.getByRole('img', { name: 'Decided by you, the judge did not answer' }),
    ).toBeVisible()
    await expect(row.getByText('10000 ms')).toBeVisible()
    await expect(row.queryByLabelText(/risk/)).toBeNull()
  },
}

/** A Session is opened from its decision's row. */
export const OpeningTheSession: Story = {
  play: async ({ canvasElement, args }) => {
    args.onOpenSession.mockClear()
    const rows = decisionsIn(canvasElement).getAllByRole('listitem')
    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Deploy the preview' }))
    await expect(args.onOpenSession).toHaveBeenCalledWith('s-deploy')
  },
}

/** The verdict, who decided and the Session filter the list; what is filtered out folds away. */
export const Filters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    await userEvent.click(canvas.getByLabelText('Verdict'))
    await userEvent.click(await body.findByRole('option', { name: 'Refused' }))
    await waitFor(() => expect(decisionsIn(canvasElement).getAllByRole('listitem')).toHaveLength(2))

    await userEvent.click(canvas.getByLabelText('Decided by'))
    await userEvent.click(await body.findByRole('option', { name: 'Judge' }))
    await waitFor(() => expect(decisionsIn(canvasElement).getAllByRole('listitem')).toHaveLength(1))

    await userEvent.click(canvas.getByLabelText('Session'))
    await userEvent.click(await body.findByRole('option', { name: 'Fix the parser' }))
    await waitFor(() => expect(canvas.getByText('No decision matches.')).toBeVisible())
  },
}

/** The ACP trace and diagnostic.log, moved here from the Profile. */
export const Diagnostics: Story = {
  play: async ({ canvasElement, args }) => {
    args.onOpenDiagnostic.mockClear()
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', { name: /Write an ACP trace of each Session/ })
    await userEvent.click(box)
    await waitFor(() => expect(box).toBeChecked())
    await expect(args.onAcpTraceChange).toHaveBeenCalledWith(true)
    await userEvent.click(canvas.getByRole('button', { name: 'Open diagnostic.log' }))
    await expect(args.onOpenDiagnostic).toHaveBeenCalled()
  },
}
