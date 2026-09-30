import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import {
  type DecisionLine,
  DeveloperSection,
  type DeveloperSectionProps,
  type FindingLine,
} from './developer-section.tsx'

/**
 * What Hemera does behind the scenes, one card per panel (#294): Hemera Auto's latest decisions
 * across every Session, and the diagnostics that moved here from the Profile.
 */
/** A stored record's fields, as the engine keeps them. */
type Fields = Readonly<Record<string, string | number | Readonly<Record<string, number>>>>

const RECORD = (fields: Fields) => JSON.stringify(fields, null, 2)

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

/** A finding file's body, as the engine writes it. */
const BODY = (number: number, title: string) =>
  [
    `# #${number} ${title}`,
    '',
    '## What happened',
    '',
    'The line ran without a shell.',
    '',
    '## Occurrences',
    '',
    '### Occurrence 1 · 2026-09-30T14:32:08.000+02:00',
    '',
    '- Session: Fix the parser (`s-parser`) · free',
  ].join('\n')

const REDIRECT: FindingLine = {
  file: '0003-commands-run-cannot-redirect-output.md',
  number: 3,
  title: 'commands_run cannot redirect output',
  kind: 'missing_capability',
  place: 'commands_run',
  severity: 'hurts',
  occurrences: 2,
  lastSeen: '15:02',
  body: BODY(3, 'commands_run cannot redirect output'),
}

const LAST_LINE: FindingLine = {
  file: '0002-fs-read-cuts-the-last-line.md',
  number: 2,
  title: 'fs_read cuts the last line of a file',
  kind: 'hemera_bug',
  place: 'fs_read',
  severity: 'blocks',
  occurrences: 1,
  lastSeen: '14:40',
  body: BODY(2, 'fs_read cuts the last line of a file'),
}

const WRONG_ALLOW: FindingLine = {
  file: '0001-hemera-auto-allowed-a-deletion.md',
  number: 1,
  title: 'Hemera Auto allowed a deletion outside the task',
  kind: 'auto_decision',
  place: 'Hemera Auto',
  severity: 'cosmetic',
  occurrences: 4,
  lastSeen: '11:12',
  body: BODY(1, 'Hemera Auto allowed a deletion outside the task'),
}

const FINDINGS = [REDIRECT, LAST_LINE, WRONG_ALLOW]

function Controlled({ acpTrace, onAcpTraceChange, tester, ...rest }: DeveloperSectionProps) {
  const [tracing, setTracing] = useState(acpTrace ?? false)
  const [testing, setTesting] = useState(tester?.on ?? false)
  return (
    <DeveloperSection
      {...rest}
      acpTrace={tracing}
      onAcpTraceChange={(on) => {
        setTracing(on)
        onAcpTraceChange?.(on)
      }}
      tester={
        tester === undefined
          ? undefined
          : {
              ...tester,
              on: testing,
              onChange: (on) => {
                setTesting(on)
                tester.onChange(on)
              },
            }
      }
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
    tester: {
      on: true,
      onChange: fn(),
      findings: FINDINGS,
      onOpenFolder: fn(),
      onOpenIndex: fn(),
    },
  },
  argTypes: {
    decisions: { control: 'object', description: 'The latest decisions, newest first.' },
    onOpenSession: { action: 'session opened' },
    acpTrace: { control: 'boolean', description: 'Whether the ACP trace is written.' },
    onAcpTraceChange: { action: 'trace turned on or off' },
    onOpenDiagnostic: { action: 'diagnostic opened' },
    tester: {
      control: 'object',
      description: 'The app tester mode, its findings, and the folder they are files of.',
    },
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

function findingsIn(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole('list', { name: 'Findings' }))
}

/**
 * The app tester's findings, the latest seen first (#300): each on one row, its number, its kind
 * as an icon, its title and where, how often it was seen, and its severity as a dot.
 */
export const AppTester: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: 'App tester mode' })).toBeChecked()
    await expect(canvas.getByText('3 findings · 7 occurrences')).toBeVisible()
    const rows = findingsIn(canvasElement).getAllByRole('listitem')
    await expect(rows).toHaveLength(3)
    const first = within(rows[0]!)
    await expect(first.getByText('#3')).toBeVisible()
    await expect(first.getByText('commands_run cannot redirect output')).toBeVisible()
    await expect(first.getByText('commands_run', { exact: true })).toBeVisible()
    await expect(first.getByRole('img', { name: 'Missing capability' })).toBeVisible()
    await expect(first.getByRole('img', { name: 'Hurts' })).toBeVisible()
    await expect(first.getByLabelText('Seen 2 times')).toBeVisible()
    await expect(within(rows[1]!).getByRole('img', { name: 'Blocks' })).toBeVisible()
    await expect(within(rows[2]!).getByRole('img', { name: 'Hemera Auto decision' })).toBeVisible()
    // Kinds and severities are icons and dots: no word badge says them.
    for (const word of ['Hurts', 'Blocks', 'Cosmetic', 'Missing capability', 'Hemera bug']) {
      expect(findingsIn(canvasElement).queryByText(word)).toBeNull()
    }
  },
}

/** A row opens on its file as the folder holds it. */
export const FindingOpened: Story = {
  play: async ({ canvasElement }) => {
    const row = within(findingsIn(canvasElement).getAllByRole('listitem')[0]!)
    const fold = row.getByRole('button', { name: /Details of the finding/ })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(fold)
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await expect(await within(canvasElement).findByLabelText('Finding file')).toHaveTextContent(
      '### Occurrence 1',
    )
  },
}

/** The kind and the severity filter the list, and the count follows. */
export const FindingFilters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    await userEvent.click(canvas.getByLabelText('Kind'))
    await userEvent.click(await body.findByRole('option', { name: 'Hemera bug' }))
    await waitFor(() => expect(findingsIn(canvasElement).getAllByRole('listitem')).toHaveLength(1))
    await expect(canvas.getByText('1 finding · 1 occurrence')).toBeVisible()

    await userEvent.click(canvas.getByLabelText('Severity'))
    await userEvent.click(await body.findByRole('option', { name: 'Cosmetic' }))
    await waitFor(() => expect(canvas.getByText('No finding matches.')).toBeVisible())
  },
}

/** The folder and its index open with the desktop: the findings are files. */
export const FindingFiles: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open the folder' }))
    await expect(args.tester?.onOpenFolder).toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Open the index' }))
    await expect(args.tester?.onOpenIndex).toHaveBeenCalled()
  },
}

/** Off, with nothing reported yet: the switch turns it on, and the index has nothing to open. */
export const AppTesterOff: Story = {
  args: {
    tester: {
      on: false,
      onChange: fn(),
      findings: [],
      onOpenFolder: fn(),
      onOpenIndex: fn(),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No finding yet.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Open the index' })).toBeDisabled()
    const box = canvas.getByRole('checkbox', { name: 'App tester mode' })
    await expect(box).not.toBeChecked()
    await userEvent.click(box)
    await waitFor(() => expect(box).toBeChecked())
    await expect(args.tester?.onChange).toHaveBeenCalledWith(true)
  },
}

/** Before the folder was read, the panel says so rather than claiming there is nothing. */
export const FindingsNotReadYet: Story = {
  args: {
    tester: {
      on: true,
      onChange: fn(),
      findings: null,
      onOpenFolder: fn(),
      onOpenIndex: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Findings cannot be read yet.')).toBeVisible()
  },
}
