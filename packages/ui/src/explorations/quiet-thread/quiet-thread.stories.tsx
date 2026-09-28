import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type { DetailsTab } from './details.tsx'
import type { Variant } from './parts.tsx'
import { QuietSession, type QuietSessionProps } from './quiet-session.tsx'

/**
 * What a Session runs: a quiet thread, and the line acts (design exploration of 28 September 2026,
 * issue #237). Storybook only: nothing here is wired, and no component of the design system
 * changed for it. The head and the composer are drawn as issue #241 is making them — no title; the
 * line, the ⓘ and the ⋯ on one row; a composer whose send is an arrow at the end of its row.
 *
 * What the three variants share: a run in the thread is one closed line — its type, its dot, its
 * name, `exit N` — that opens on its output, with no badge and no Stop (points 1 and 2). The line
 * holds what runs, what failed until it is seen, and each command of the catalogue that ran, as the
 * shortcut to run it again; a one-off leaves once over; any chip leaves by the ✕ of its glance, and
 * stays in the history (points 4 and 9). A chip's glance has Run again or Stop beside its ⓘ, and so
 * has every run of the history (point 11). The ⓘ details keep the whole history and the catalogue,
 * which is run, added to, changed and emptied without leaving the Session (points 8 and 10). A
 * permission waits where the proposals wait, and its card in the thread is a closed record (point
 * 7). What arrives and leaves grows and folds, pushing what is around it (point 6).
 *
 * What differs:
 *
 * - A · Tray · one tray docked on the composer: the permission a row of its own, answered there;
 *   the proposals one line with Review and Add all. A one-off leaves the line after a short while;
 *   it is kept from its thread entry. The details hold one Commands tab: the catalogue over the
 *   history.
 * - B · Pill · a pill over the composer with a count; nothing on the page moves for it, and its
 *   review opens above it. A one-off leaves the line once seen; it is kept from its glance. The
 *   details hold a History tab and a Catalogue tab.
 * - C · Deck · a deck of cards on the composer, one at a time, the permission on top. A one-off
 *   dims and leaves, Run's menu keeping it under Earlier, where it is kept. The catalogue is edited
 *   in Run's menu itself, and the details hold one Commands tab where each command carries its
 *   runs.
 *
 * Each is drawn with a run going on, a failed run, the agent proposing six commands, a permission
 * waiting, a chip's glance, the history, the catalogue, and a script played live. The theme is the
 * toolbar's: every story is meant to be read in both.
 */

const meta = {
  title: 'Explorations/Quiet thread',
  component: QuietSession,
  tags: ['autodocs', 'new'],
  parameters: {
    layout: 'fullscreen',
    // A Session is a window: each story is read in a frame of its own rather than inline.
    docs: { story: { inline: false, height: '44rem' } },
  },
  args: { variant: 'tray', scene: 'running', onOpenUrl: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['tray', 'pill', 'deck'] },
    scene: {
      control: 'inline-radio',
      options: ['running', 'failed', 'proposals', 'permission', 'answered', 'live'],
    },
    details: {
      control: 'select',
      options: [null, 'activity', 'commands', 'history', 'catalogue', 'context'],
    },
    reviewing: { control: 'boolean' },
    runOpen: { control: 'boolean' },
  },
} satisfies Meta<typeof QuietSession>

export default meta

type Story = StoryObj<typeof meta>

/** The one-line rationale of each variant, which every one of its stories opens with. */
const WHY: Record<Variant, string> = {
  tray: 'A · Tray — one tray on the composer holds whatever waits, the permission as a row answered in place; a one-off leaves the line after a short while; the details hold one Commands tab, the catalogue over the history.',
  pill: 'B · Pill — a pill over the composer counts whatever waits and opens its review above it, nothing else moving; a one-off leaves the line once seen; the details hold a History tab and a Catalogue tab.',
  deck: 'C · Deck — a deck on the composer, one card at a time, the permission on top; a one-off dims and leaves, kept under Earlier in Run; the catalogue is edited in Run itself, and the details group each command with its runs.',
}

const LETTER: Record<Variant, string> = { tray: 'A', pill: 'B', deck: 'C' }

/** A story of a variant: its rationale, then what this one shows. */
function story(
  variant: Variant,
  name: string,
  shows: string,
  args: Omit<QuietSessionProps, 'variant' | 'onOpenUrl'>,
) {
  return {
    name: `${LETTER[variant]} · ${name}`,
    args: { variant, ...args },
    parameters: { docs: { description: { story: `${WHY[variant]}\n\n${shows}` } } },
  } satisfies Story
}

/** The thread, still there and still readable. */
async function threadStays(canvasElement: HTMLElement): Promise<void> {
  await expect(
    within(canvasElement).getByRole('log', { name: 'The thread of this Session' }),
  ).toBeVisible()
}

const HISTORY: Record<Variant, DetailsTab> = { tray: 'commands', pill: 'history', deck: 'commands' }

const RUNNING =
  'A run going on: the server and the tests run, lint ran and stays as its shortcut, the `sleep 120` that ended before is gone from the line. In the thread, each run is one closed line.'
const FAILED =
  'A failed run: `v2 check` stays on the line, red, until its glance or its entry is opened; the one-off that passed is gone.'
const PROPOSED =
  'The agent proposes six commands while it sets the Project up: they come to the composer, whatever the scroll.'
const ASKING =
  'A permission waits: the agent asks to run a one-off. It waits with the rest, and the thread keeps a closed record of it.'
const GLANCE =
  'The glance of a failed chip: Run again, the ⓘ of its details, and the ✕ that takes it out of the line; its output under it.'
const TRACE =
  'The ⓘ details on the history: every run of the Session and every line of the agent’s shell, in order, with who started it, Run again or Stop, and the output on demand.'
const CATALOGUE =
  'The catalogue from inside the Session: run a command, change it, remove it, or add one, in the catalogue’s own dialog over the Session.'
const LIVE =
  'Played live: a one-off starts, passes and leaves the line by the variant’s rule; then the six proposals arrive, then a permission. Watch what grows and folds.'

// A · Tray

export const TrayRunning: Story = {
  ...story('tray', 'Run going on', RUNNING, { scene: 'running' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'test, running' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'lint, done' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'sleep 120, done' })).toBeNull()
    await expect(canvas.queryByRole('heading', { name: 'CSV invoice export' })).toBeNull()
    await threadStays(canvasElement)
  },
}

export const TrayFailed: Story = story('tray', 'Failed run', FAILED, { scene: 'failed' })

export const TrayProposals: Story = {
  ...story('tray', 'Six proposals', PROPOSED, { scene: 'proposals', reviewing: true }),
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('region', { name: 'Waiting for your answer' })
    await expect(within(tray).getByRole('button', { name: 'Add all 6' })).toBeVisible()
    await expect(within(tray).getByRole('button', { name: 'Add dev' })).toBeVisible()
  },
}

export const TrayPermission: Story = {
  ...story('tray', 'Permission waiting', ASKING, { scene: 'permission' }),
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('region', { name: 'Waiting for your answer' })
    await expect(within(tray).getByRole('button', { name: 'Allow once' })).toBeVisible()
  },
}

/** Both answered from the tray: a proposal, then the rest at once, then the permission. */
export const TrayAnswering: Story = {
  ...story(
    'tray',
    'Answering',
    'The tray answered: one proposal by its mark, the five others by Add all; the tray folds away once nothing waits, and the thread keeps the tally.',
    { scene: 'proposals', reviewing: true },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tray = canvas.getByRole('region', { name: 'Waiting for your answer' })
    await userEvent.click(within(tray).getByRole('button', { name: 'Add dev' }))
    await waitFor(() => expect(within(tray).queryByRole('button', { name: 'Add dev' })).toBeNull())
    await userEvent.click(within(tray).getByRole('button', { name: 'Add all 5' }))
    await waitFor(() =>
      expect(canvas.queryByRole('region', { name: 'Waiting for your answer' })).toBeNull(),
    )
    await expect(canvas.getByText('6 added')).toBeVisible()
  },
}

export const TrayGlance: Story = story('tray', 'Glance', GLANCE, {
  scene: 'failed',
  glance: 'run-v2-check',
})

export const TrayHistory: Story = story('tray', 'History', TRACE, {
  scene: 'running',
  details: HISTORY.tray,
})

export const TrayCatalogue: Story = story(
  'tray',
  'Catalogue',
  `${CATALOGUE} Run's menu leads to it: Catalogue, at its foot, opens the details on their Commands tab.`,
  { scene: 'running', runOpen: true },
)

export const TrayLive: Story = story('tray', 'Live', LIVE, { scene: 'live' })

// B · Pill

export const PillRunning: Story = story('pill', 'Run going on', RUNNING, { scene: 'running' })

export const PillFailed: Story = story('pill', 'Failed run', FAILED, { scene: 'failed' })

export const PillProposals: Story = story('pill', 'Six proposals', PROPOSED, {
  scene: 'proposals',
  reviewing: true,
})

export const PillPermission: Story = {
  ...story('pill', 'Permission waiting', ASKING, { scene: 'permission', reviewing: true }),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).getByRole('group', {
        name: 'Permission for Run command',
      }),
    ).toBeVisible()
  },
}

export const PillGlance: Story = story('pill', 'Glance', GLANCE, {
  scene: 'failed',
  glance: 'run-v2-check',
})

export const PillHistory: Story = story('pill', 'History', TRACE, {
  scene: 'running',
  details: HISTORY.pill,
})

export const PillCatalogue: Story = story('pill', 'Catalogue', CATALOGUE, {
  scene: 'running',
  details: 'catalogue',
})

export const PillLive: Story = story('pill', 'Live', LIVE, { scene: 'live' })

// C · Deck

export const DeckRunning: Story = story('deck', 'Run going on', RUNNING, { scene: 'running' })

export const DeckFailed: Story = story('deck', 'Failed run', FAILED, { scene: 'failed' })

export const DeckProposals: Story = {
  ...story('deck', 'Six proposals', PROPOSED, { scene: 'proposals' }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Add dev' })).toBeVisible()
  },
}

/** The deck answered one card at a time: the next takes the top card's place. */
export const DeckAnswering: Story = {
  ...story(
    'deck',
    'Answering',
    'One card answered: the next proposal takes its place where it stood, and the deck is one card thinner.',
    { scene: 'proposals' },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add dev' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Add test' })).toBeVisible())
  },
}

export const DeckPermission: Story = story('deck', 'Permission waiting', ASKING, {
  scene: 'permission',
})

export const DeckGlance: Story = story('deck', 'Glance', GLANCE, {
  scene: 'failed',
  glance: 'run-v2-check',
})

export const DeckHistory: Story = story('deck', 'History', TRACE, {
  scene: 'running',
  details: HISTORY.deck,
})

export const DeckCatalogue: Story = story(
  'deck',
  'Catalogue',
  `${CATALOGUE} Here it is Run's own menu: a pencil on each command, and Add at its foot.`,
  { scene: 'failed', runOpen: true },
)

export const DeckLive: Story = story('deck', 'Live', LIVE, { scene: 'live' })
