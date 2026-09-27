import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { MID_PLAN } from '../../spec/spec-fixtures.ts'
import { FACTS, type Mission, type Place, type WorkspaceCase } from './fixtures.ts'
import type { PlaceActions } from './parts.tsx'
import { DrawerSession } from './variant-drawer.tsx'
import { EdgeSession } from './variant-edge.tsx'
import { StripSession } from './variant-strip.tsx'

/**
 * Where a Session's Workspace, commands and services live (design exploration of 27 September
 * 2026, issue #219). Storybook only: nothing here is wired, and no component of the design system
 * changed for it.
 *
 * Today everything a Session works with is behind the ⓘ of its head, in the "Session details"
 * dialog, and its Workspace is not shown at all. Three variants put it at hand, each beside the
 * panels a Session already has — the Spec of a `define` Session, the build of a `build` one — and
 * never as a second panel competing with them:
 *
 * - A · Edge · the Session's own glyphs join the small frame at the window's edge, and open as
 *   tabs of the one panel on the right, the mission being its first tab. The ⓘ dialog is removed.
 * - B · Strip · a strip of the Session's own under its title says it all in words, and a press
 *   unfolds a sheet above the thread; the area on the right stays the mission's. The ⓘ dialog keeps
 *   the trace and the folder.
 * - C · Drawer · a bar across the bottom of the whole Session, and a drawer opening upwards from
 *   it, as a terminal under an editor; `Ctrl+J` opens it from anywhere. The ⓘ dialog is removed.
 *
 * Each is drawn in three Sessions (free, define with its Spec open and folded, build), with a
 * Workspace being prepared, ready and failed, a command running with its output, a service up, a
 * Session with no Workspace, and a round trip from the conversation to them and back. The theme is
 * the toolbar's: every story is meant to be read in both. The build panel is a stand-in drawn after
 * the one of lot 5, which is not on this branch.
 */

type Variant = 'edge' | 'strip' | 'drawer'

interface ScreenProps {
  variant: Variant
  mission: Mission
  workspace: WorkspaceCase
  /** What is open as the Session opens: a place, the mission's own tab (edge), or nothing. */
  open: Place | 'mission' | null
  /** Whether the Spec of a `define` Session starts folded (strip and drawer). */
  specFolded?: boolean | undefined
  /** Whether the ⓘ dialog starts open (strip). */
  detailsOpen?: boolean | undefined
}

const ACTIONS: PlaceActions = {
  onRun: fn(),
  onStop: fn(),
  onOpenUrl: fn(),
  onResume: fn(),
  onOpenTrace: fn(),
  onOpenFolder: fn(),
}

function Screen({
  variant,
  mission,
  workspace,
  open,
  specFolded = true,
  detailsOpen = false,
}: ScreenProps): ReactNode {
  const facts = FACTS[workspace]
  const spec = mission === 'define' ? MID_PLAN : undefined
  const place = open === 'mission' ? null : open
  return (
    <TooltipProvider>
      {variant === 'edge' && (
        <EdgeSession
          mission={mission}
          facts={facts}
          spec={spec}
          defaultTab={open}
          actions={ACTIONS}
        />
      )}
      {variant === 'strip' && (
        <StripSession
          mission={mission}
          facts={facts}
          spec={spec}
          specFolded={specFolded}
          defaultPlace={place}
          defaultDetailsOpen={detailsOpen}
          actions={ACTIONS}
        />
      )}
      {variant === 'drawer' && (
        <DrawerSession
          mission={mission}
          facts={facts}
          spec={spec}
          specFolded={specFolded}
          defaultPlace={place}
          actions={ACTIONS}
        />
      )}
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Session workspace',
  component: Screen,
  tags: ['autodocs', 'new'],
  parameters: {
    layout: 'fullscreen',
    // A Session is a window: each story is read in a frame of its own rather than inline.
    docs: { story: { inline: false, height: '40rem' } },
  },
  args: { variant: 'edge', mission: 'free', workspace: 'ready', open: null },
  argTypes: {
    variant: { control: 'inline-radio', options: ['edge', 'strip', 'drawer'] },
    mission: { control: 'inline-radio', options: ['free', 'define', 'build'] },
    workspace: { control: 'inline-radio', options: ['preparing', 'ready', 'failed', 'none'] },
    open: {
      control: 'select',
      options: [null, 'mission', 'workspace', 'commands', 'services', 'activity', 'context'],
    },
    specFolded: { control: 'boolean' },
    detailsOpen: { control: 'boolean' },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** The one-line rationale of each variant, which every one of its stories opens with. */
const WHY: Record<Variant, string> = {
  edge: "A · Edge — one area on the right: the Session's own glyphs join the mission's small frame at the window's edge and open as tabs of the one panel, the Spec or the build being its first tab; the ⓘ dialog is removed.",
  strip:
    "B · Strip — the Session's own strip under its title says what it works with in words, and a press unfolds it in place above the thread, pushing it down; the area on the right stays the mission's alone, and the ⓘ dialog keeps only the trace and the folder.",
  drawer:
    'C · Drawer — a bar across the bottom of the whole Session always says the Workspace, what runs and what is up, and a drawer opens upwards from it across the chat and the panel, as a terminal under an editor (Ctrl+J); the ⓘ dialog is removed.',
}

/** A story of a variant: its rationale, then what this one shows. */
function story(variant: Variant, name: string, shows: string, args: Omit<ScreenProps, 'variant'>) {
  return {
    name,
    args: { variant, ...args },
    parameters: { docs: { description: { story: `${WHY[variant]}\n\n${shows}` } } },
  } satisfies Story
}

/** The thread of the Session, still there and still readable beside what was opened. */
async function conversationStays(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('log', { name: 'The thread of this Session' })).toBeVisible()
}

// A · Edge

export const EdgeFreeAtRest: Story = {
  ...story(
    'edge',
    'A · Free · At rest',
    'A free Session at rest: its frame at the edge, a dot on each place where something goes on.',
    {
      mission: 'free',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /^Commands, 2 running/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Session details' })).toBeNull()
  },
}

export const EdgeFreeCommandRunning: Story = story(
  'edge',
  'A · Free · Command running',
  'The panel open on Commands: the catalogue with Run and Stop, two runs, the server with its output.',
  { mission: 'free', workspace: 'ready', open: 'commands' },
)

export const EdgeFreeServiceUp: Story = story(
  'edge',
  'A · Free · Service up',
  'The panel open on Services: the server up, its address, Stop.',
  { mission: 'free', workspace: 'ready', open: 'services' },
)

export const EdgeFreePreparing: Story = story(
  'edge',
  'A · Free · Workspace preparing',
  'The Workspace being prepared: its repositories and its steps, the link running.',
  { mission: 'free', workspace: 'preparing', open: 'workspace' },
)

export const EdgeFreeFailed: Story = story(
  'edge',
  'A · Free · Workspace failed',
  'The preparation failed on install: Git’s own words and Resume.',
  { mission: 'free', workspace: 'failed', open: 'workspace' },
)

export const EdgeFreeNoWorkspace: Story = story(
  'edge',
  'A · Free · No Workspace',
  'A Session with no Workspace: said in words, and nothing to run.',
  { mission: 'free', workspace: 'none', open: 'workspace' },
)

export const EdgeDefineSpecOpen: Story = story(
  'edge',
  'A · Define · Spec open',
  'A define Session with its Spec open: the Spec is the first tab of the one panel, the Session’s places the next ones.',
  { mission: 'define', workspace: 'ready', open: 'mission' },
)

export const EdgeDefineSpecFolded: Story = story(
  'edge',
  'A · Define · Spec folded',
  'The same Session folded: one small frame, the phases above and the Session’s places under them.',
  { mission: 'define', workspace: 'ready', open: null },
)

export const EdgeBuild: Story = story(
  'edge',
  'A · Build',
  'A build Session: the build is the first tab, and its Commands one press away on the same panel.',
  { mission: 'build', workspace: 'ready', open: 'commands' },
)

export const EdgeRoundTrip: Story = {
  ...story(
    'edge',
    'A · Round trip',
    'From the conversation to the running commands and back: a glyph unfolds the panel on its tab, Escape folds it and gives the keyboard back to the glyph.',
    {
      mission: 'define',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const glyph = canvas.getByRole('button', { name: /^Commands, 2 running/ })
    await userEvent.click(glyph)
    const tab = await canvas.findByRole('tab', { name: 'Commands' })
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'))
    await expect(await canvas.findByText('Runs of this Session')).toBeVisible()
    await conversationStays(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(glyph).toHaveFocus())
  },
}

// B · Strip

export const StripFreeAtRest: Story = {
  ...story(
    'strip',
    'B · Free · At rest',
    'A free Session at rest: the strip under the title says it all without a press.',
    {
      mission: 'free',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Workspace: csv-export · Ready' }),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Services: 1 up' })).toBeVisible()
  },
}

export const StripFreeCommandRunning: Story = story(
  'strip',
  'B · Free · Command running',
  'Commands unfolded under the strip: the catalogue, the runs and their output, the thread pushed down under them.',
  { mission: 'free', workspace: 'ready', open: 'commands' },
)

export const StripFreeServiceUp: Story = story(
  'strip',
  'B · Free · Service up',
  'Services unfolded: the server up, its address, Stop.',
  { mission: 'free', workspace: 'ready', open: 'services' },
)

export const StripFreePreparing: Story = story(
  'strip',
  'B · Free · Workspace preparing',
  'The Workspace being prepared, its state on the strip and its steps in the sheet.',
  { mission: 'free', workspace: 'preparing', open: 'workspace' },
)

export const StripFreeFailed: Story = story(
  'strip',
  'B · Free · Workspace failed',
  'The preparation failed: the strip says Failed in red, the sheet says why and offers Resume.',
  { mission: 'free', workspace: 'failed', open: 'workspace' },
)

export const StripFreeNoWorkspace: Story = story(
  'strip',
  'B · Free · No Workspace',
  'A Session with no Workspace: the strip says so first.',
  { mission: 'free', workspace: 'none', open: 'workspace' },
)

export const StripFreeDetails: Story = story(
  'strip',
  'B · Free · Details kept for rare things',
  'The ⓘ dialog as this variant keeps it: the trace and the Workspace folder, nothing used every day.',
  { mission: 'free', workspace: 'ready', open: null, detailsOpen: true },
)

export const StripDefineSpecOpen: Story = story(
  'strip',
  'B · Define · Spec open',
  'A define Session with its Spec open on the right and Commands unfolded on the chat’s column: two places, never two panels.',
  { mission: 'define', workspace: 'ready', open: 'commands', specFolded: false },
)

export const StripDefineSpecFolded: Story = story(
  'strip',
  'B · Define · Spec folded',
  'The Spec folded to its small frame, the Workspace unfolded under the strip.',
  { mission: 'define', workspace: 'ready', open: 'workspace' },
)

export const StripBuild: Story = story(
  'strip',
  'B · Build',
  'A build Session: the build panel on the right, the strip over the chat, Services unfolded.',
  { mission: 'build', workspace: 'ready', open: 'services' },
)

export const StripRoundTrip: Story = {
  ...story(
    'strip',
    'B · Round trip',
    'From the conversation to the running commands and back: a press on the strip unfolds the sheet above the thread, Escape folds it and gives the keyboard back to the strip.',
    {
      mission: 'free',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const entry = canvas.getByRole('button', { name: 'Commands: 2 running' })
    await userEvent.click(entry)
    await expect(entry).toHaveAttribute('aria-expanded', 'true')
    const sheet = await canvas.findByRole('region', { name: 'Commands' })
    await expect(within(sheet).getByText('Runs of this Session')).toBeVisible()
    await conversationStays(canvasElement)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Stop dev' }))
    await expect(ACTIONS.onStop).toHaveBeenCalledWith('dev')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Commands' })).toBeNull())
    await expect(entry).toHaveFocus()
  },
}

// C · Drawer

export const DrawerFreeAtRest: Story = {
  ...story(
    'drawer',
    'C · Free · At rest',
    'A free Session at rest: the bar at the bottom says the Workspace, what runs and what is up.',
    {
      mission: 'free',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('group', { name: "This Session's bar" })
    await expect(within(bar).getByRole('button', { name: 'Commands: 2 running' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Session details' })).toBeNull()
  },
}

export const DrawerFreeCommandRunning: Story = story(
  'drawer',
  'C · Free · Command running',
  'The drawer open on Commands: the runs and their output at the width of the window.',
  { mission: 'free', workspace: 'ready', open: 'commands' },
)

export const DrawerFreeServiceUp: Story = story(
  'drawer',
  'C · Free · Service up',
  'The drawer open on Services: the server up, its address, Stop.',
  { mission: 'free', workspace: 'ready', open: 'services' },
)

export const DrawerFreePreparing: Story = story(
  'drawer',
  'C · Free · Workspace preparing',
  'The Workspace being prepared: the bar breathes on it, the drawer lists the steps.',
  { mission: 'free', workspace: 'preparing', open: 'workspace' },
)

export const DrawerFreeFailed: Story = story(
  'drawer',
  'C · Free · Workspace failed',
  'The preparation failed: Git’s own words and Resume, the bar red on the Workspace.',
  { mission: 'free', workspace: 'failed', open: 'workspace' },
)

export const DrawerFreeNoWorkspace: Story = story(
  'drawer',
  'C · Free · No Workspace',
  'A Session with no Workspace: the bar says so at its start.',
  { mission: 'free', workspace: 'none', open: 'workspace' },
)

export const DrawerDefineSpecOpen: Story = story(
  'drawer',
  'C · Define · Spec open',
  'A define Session with its Spec open: the drawer runs under the chat and the Spec alike, and both give it their foot.',
  { mission: 'define', workspace: 'ready', open: 'commands', specFolded: false },
)

export const DrawerDefineSpecFolded: Story = story(
  'drawer',
  'C · Define · Spec folded',
  'The Spec folded to its small frame and the drawer closed: the bar alone.',
  { mission: 'define', workspace: 'ready', open: null },
)

export const DrawerBuild: Story = story(
  'drawer',
  'C · Build',
  'A build Session: the build panel on the right, the drawer open on Commands under both.',
  { mission: 'build', workspace: 'ready', open: 'commands' },
)

export const DrawerRoundTrip: Story = {
  ...story(
    'drawer',
    'C · Round trip',
    'From the conversation to the running commands and back: Ctrl+J opens the drawer where it was left, Escape closes it and gives the keyboard back to the bar.',
    {
      mission: 'free',
      workspace: 'ready',
      open: null,
    },
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('textbox'))
    await userEvent.keyboard('{Control>}j{/Control}')
    const drawer = await canvas.findByRole('region', { name: 'What this Session works with' })
    await waitFor(() =>
      expect(within(drawer).getByRole('tab', { name: 'Commands' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await expect(within(drawer).getByText('Runs of this Session')).toBeVisible()
    await conversationStays(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(canvas.queryByRole('region', { name: 'What this Session works with' })).toBeNull(),
    )
    await expect(canvas.getByRole('button', { name: 'Commands: 2 running' })).toHaveFocus()
  },
}
