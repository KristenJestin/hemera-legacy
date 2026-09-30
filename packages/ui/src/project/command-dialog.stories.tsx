import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { type Journey, journeyOf, readEveryFrame } from '../../.storybook/journey.ts'
import { movesLess } from '../../.storybook/reduced-motion.ts'

import { Button } from '../components/button/button.tsx'
import type { PathEntry, PathListing } from '../components/suggest/path-input.tsx'
import { CommandDialog, type CommandDialogProps } from './command-dialog.tsx'
import type { CommandLine, RepositoryLine } from './model.ts'

/**
 * The dialog a command of the catalogue is added or edited in, on fixtures (recette 1 and 2 of
 * lot 20, D8-07, D8-09, D8-10).
 *
 * The story opens it at once, as the pencil of a row or the "Add command" of the section would,
 * and holds what the engine answers in `refusal`. Two repositories end in `api`, so the base
 * select names them with their path.
 */
const REPOSITORIES: RepositoryLine[] = [
  { path: './sources/api', branch: 'main', exists: true, includedByDefault: true, icon: null },
  { path: './sources/front', branch: 'develop', exists: true, includedByDefault: true, icon: null },
  { path: './legacy/api', branch: 'main', exists: true, includedByDefault: false, icon: null },
]

const DEV: CommandLine = {
  id: 'dev',
  name: 'dev',
  command: 'pnpm dev',
  lineWindows: null,
  lineLinux: null,
  type: 'serve',
  scope: 'workspace',
  portless: false,
  portlessName: null,
  folderBase: './sources/front',
  folder: '',
  runAtOpen: false,
}

const TAKEN = 'a command named "check" is already declared'

/**
 * The folders under each base, one level at a time, as the engine would list them (#109): keyed
 * by the base — '' for the Workspace root — and the folder under it.
 */
const TREE = new Map<string, string[]>([
  [':', ['docs', 'legacy', 'sources']],
  [':sources', ['api', 'front']],
  ['./sources/front:', ['packages', 'web']],
  ['./sources/front:packages', ['core', 'ui']],
])

async function listing({ base, relative }: PathListing): Promise<readonly PathEntry[]> {
  const names = TREE.get(`${base ?? ''}:${relative}`) ?? []
  return await Promise.resolve(names.map((name) => ({ name, kind: 'folder' as const })))
}

/** The listing the stories hand over, kept so a play can ask what it was asked. */
const listFolder = fn(listing)

interface Extra {
  /** What the engine answers when the command is handed over: null, or a refusal. */
  refusal?: string | null
}

function Controlled({
  open,
  refusal = null,
  onOpenChange,
  onSubmit,
  ...rest
}: CommandDialogProps & Extra) {
  const [shown, setShown] = useState(open)
  return (
    <div className="flex h-screen flex-col items-start gap-2 p-6">
      <Button onClick={() => setShown(true)}>Open the dialog</Button>
      <CommandDialog
        {...rest}
        open={shown}
        onOpenChange={(next) => {
          setShown(next)
          onOpenChange(next)
        }}
        onSubmit={async (command) => {
          await onSubmit(command)
          return refusal
        }}
      />
    </div>
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Blocks/Workspace/CommandDialog',
  component: CommandDialog,
  render: (args) => <Controlled {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    command: DEV,
    repositories: REPOSITORIES,
    portlessInstalled: true,
    projectName: 'Atlas Web',
    refusal: null,
    onOpenChange: fn(),
    onListFolder: listFolder,
    onSubmit: fn(async () => await Promise.resolve(null)),
  },
  argTypes: {
    open: { control: 'boolean', description: 'Whether the dialog is on screen.' },
    command: { control: 'object', description: 'The command edited, or null when one is added.' },
    repositories: {
      control: 'object',
      description: 'The repositories a command may run from.',
    },
    portlessInstalled: {
      control: 'boolean',
      description: 'Whether portless is on this machine; the option is hidden when it is not.',
    },
    projectName: { control: 'text', description: 'The Project, whose slug Portless is offered.' },
    refusal: { control: 'text', description: 'What the engine answers; null writes it.' },
    onOpenChange: { control: false, description: 'Opens or closes the dialog.' },
    onListFolder: {
      control: false,
      description: 'Lists one folder under the base a command runs from.',
    },
    onSubmit: { control: false, description: 'Writes the command.' },
  },
} satisfies Meta<typeof Controlled>

export default meta
type Story = StoryObj<typeof meta>

function dialog() {
  return within(within(document.body).getByRole('dialog'))
}

/** Resolves on the next frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Opens a select of the dialog by its name and chooses one of its items, then waits it out. */
async function choose(label: string, option: RegExp): Promise<void> {
  await userEvent.click(dialog().getByLabelText(label))
  const list = await waitFor(() => within(document.body).getByRole('listbox'))
  await userEvent.click(within(list).getByRole('option', { name: option }))
  // The list is waited out: the accessibility pass runs on whatever is on the page at the end,
  // and a popup still leaving carries focus guards that read as an error.
  await waitFor(() => {
    expect(within(document.body).queryByRole('listbox')).toBeNull()
  })
}

/** Adding one: a name, a line, a type, and a folder under one of the repositories. */
export const Add: Story = {
  args: { command: null },
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    await expect(inside.getByRole('button', { name: 'Add command' })).toBeDisabled()
    // The name says what it is for: what the agent runs the command by (#109).
    await expect(inside.getByText('The agent runs it by this name.')).toBeVisible()
    await userEvent.type(inside.getByRole('textbox', { name: 'Name' }), 'check')
    await userEvent.type(inside.getByRole('textbox', { name: 'Line' }), 'pnpm check')
    await choose('Type', /^Test/)
    // Two repositories are called `api`: each is named with its path beside it.
    await choose('Runs from', /^api \(\.\/sources\/api\)/)
    await userEvent.type(inside.getByRole('textbox', { name: 'Folder' }), 'packages/core')
    // The folder is typed, with suggestions, and there is no picker beside it (#109).
    await expect(inside.queryByRole('button', { name: /^Browse/ })).toBeNull()
    // A scope and Portless are a server's alone.
    await expect(inside.queryByLabelText('Scope')).toBeNull()
    await userEvent.click(inside.getByRole('button', { name: 'Add command' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        id: 'check',
        name: 'check',
        command: 'pnpm check',
        lineWindows: null,
        lineLinux: null,
        type: 'test',
        scope: 'workspace',
        portless: false,
        portlessName: null,
        folderBase: './sources/api',
        folder: 'packages/core',
        runAtOpen: false,
      })
    })
  },
}

/**
 * One line, run on every system: the field a command with one line opens on, and the box beside
 * its label that gives it two (#109).
 *
 * The line is never asked twice: the one typed here becomes what Linux and macOS run, and it is
 * still there when the box is unticked.
 */
export const OneLine: Story = {
  args: { command: null },
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    const perSystem = inside.getByRole('checkbox', { name: 'A line per system' })
    await expect(perSystem).not.toBeChecked()
    // No select says it any more: one box, on the row of the line.
    await expect(inside.queryByLabelText('Lines')).toBeNull()
    await userEvent.type(inside.getByRole('textbox', { name: 'Line' }), 'pnpm check')
    // One field or two, never three: the two of a line per system replace the one they came from.
    await userEvent.click(perSystem)
    await expect(inside.queryByRole('textbox', { name: 'Line' })).toBeNull()
    await expect(inside.getByRole('textbox', { name: 'Windows' })).toBeVisible()
    await expect(inside.getByRole('textbox', { name: 'Linux and macOS' })).toHaveValue('pnpm check')
    // Back to one line: the field holds what was typed, and the systems are gone.
    await userEvent.click(perSystem)
    await expect(inside.getByRole('textbox', { name: 'Line' })).toHaveValue('pnpm check')
    await expect(inside.queryByRole('textbox', { name: 'Windows' })).toBeNull()
  },
}

/**
 * Two lines, side by side on one row, which is what a command with a line of its own opens on
 * (#109): the line Windows runs, and the line every other system runs.
 */
export const TwoLines: Story = {
  args: { command: { ...DEV, lineWindows: 'pnpm dev:win', lineLinux: 'pnpm dev' } },
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    // Saved with a line of its own, it opens on the two fields rather than on one of them.
    await expect(inside.getByRole('checkbox', { name: 'A line per system' })).toBeChecked()
    const windows = inside.getByRole('textbox', { name: 'Windows' })
    const others = inside.getByRole('textbox', { name: 'Linux and macOS' })
    await expect(windows).toHaveValue('pnpm dev:win')
    await expect(others).toHaveValue('pnpm dev')
    // Side by side: the two boxes stand on the same row.
    await expect(windows.getBoundingClientRect().top).toBe(others.getBoundingClientRect().top)
    // Typing for Windows leaves the other system alone.
    await userEvent.type(windows, ' --watch')
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        ...DEV,
        lineWindows: 'pnpm dev:win --watch',
        lineLinux: 'pnpm dev',
      })
    })
  },
}

/**
 * Editing one: its name is fixed, and its line, its systems and its folder are rewritten.
 *
 * The command holds one line, so that is the field drawn; asking for a line per system gives it
 * the two, and the line that was there becomes what Linux and macOS run (recette 2).
 */
export const Edit: Story = {
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    const name = inside.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue('dev')
    await expect(name).toBeDisabled()
    const line = inside.getByRole('textbox', { name: 'Line' })
    await expect(line).toHaveValue('pnpm dev')
    await userEvent.clear(line)
    await userEvent.type(line, 'pnpm dev --host')
    await userEvent.click(inside.getByRole('checkbox', { name: 'A line per system' }))
    // Nothing is lost and nothing is asked twice: the one line is the one Linux and macOS run.
    await expect(inside.queryByRole('textbox', { name: 'Line' })).toBeNull()
    await expect(inside.getByRole('textbox', { name: 'Linux and macOS' })).toHaveValue(
      'pnpm dev --host',
    )
    await userEvent.type(inside.getByRole('textbox', { name: 'Windows' }), 'pnpm dev:win')
    await choose('Runs from', /^Workspace root/)
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        ...DEV,
        command: 'pnpm dev --host',
        lineWindows: 'pnpm dev:win',
        lineLinux: 'pnpm dev --host',
        folderBase: null,
      })
    })
  },
}

/**
 * The folder typed with suggestions, one level at a time, from where the command runs (#109):
 * the folders of `./sources/front`, then what `packages` holds once it is chosen. `..` is never
 * offered, and a path typed above the base is refused with its reason.
 */
export const Suggestions: Story = {
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    const folder = inside.getByRole('textbox', { name: 'Folder' })
    await userEvent.click(folder)
    // The first level: what the base holds, asked of the base the command runs from.
    const first = await waitFor(() => within(document.body).getByRole('listbox'))
    await waitFor(() => {
      expect(within(first).getByRole('option', { name: 'packages/' })).toBeVisible()
    })
    await waitFor(() => {
      expect(within(first).getByRole('option', { name: 'web/' })).toBeVisible()
    })
    await expect(within(first).queryByRole('option', { name: /\.\./ })).toBeNull()
    await expect(listFolder).toHaveBeenCalledWith({
      base: './sources/front',
      relative: '',
      kinds: ['folder'],
    })
    // Above the base: nothing is offered, and the field says why.
    await userEvent.type(folder, '../')
    await waitFor(() => {
      expect(inside.getByText('That path climbs above where it runs from.')).toHaveStyle({
        opacity: '1',
      })
    })
    await expect(within(document.body).queryByRole('option')).toBeNull()
    await expect(inside.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.clear(folder)
    listFolder.mockClear()
    await userEvent.type(folder, 'pa')
    await waitFor(() => {
      expect(within(document.body).getByRole('option', { name: 'packages/' })).toBeVisible()
    })
    await userEvent.keyboard('{Enter}')
    await expect(folder).toHaveValue('packages/')
    // The second level: the list stays open on what the folder chosen holds.
    await waitFor(() => {
      expect(listFolder).toHaveBeenCalledWith({
        base: './sources/front',
        relative: 'packages',
        kinds: ['folder'],
      })
    })
    const second = within(document.body).getByRole('listbox')
    await waitFor(() => {
      expect(within(second).getByRole('option', { name: 'packages/ui/' })).toBeVisible()
    })
    await userEvent.click(within(second).getByRole('option', { name: 'packages/ui/' }))
    await expect(folder).toHaveValue('packages/ui/')
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({ ...DEV, folder: 'packages/ui' })
    })
  },
}

/** A server: its scope, and Portless offered, named after the Project, with its addresses. */
export const Portless: Story = {
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    await expect(inside.getByLabelText('Scope')).toBeInTheDocument()
    const box = inside.getByRole('checkbox', { name: /Serve through Portless/ })
    await expect(box).not.toBeChecked()
    await expect(inside.queryByRole('textbox', { name: 'Portless name' })).toBeNull()
    await userEvent.click(box)
    const name = inside.getByRole('textbox', { name: 'Portless name' })
    await expect(name).toHaveValue('atlas-web')
    await expect(inside.getByText('https://atlas-web.localhost')).toBeVisible()
    // Hemera passes the name and nothing else: in a Workspace's worktree, `portless` puts the
    // branch in front of it itself (recette 2, D8-04).
    await expect(inside.getByText('https://<branch>.atlas-web.localhost')).toBeVisible()
    await userEvent.clear(name)
    await userEvent.type(name, 'front')
    await expect(inside.getByText('https://front.localhost')).toBeVisible()
    await choose('Scope', /^One instance, run in main/)
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        ...DEV,
        scope: 'project',
        portless: true,
        portlessName: 'front',
      })
    })
  },
}

/** A Portless name that cannot be the first label of an address is refused on the spot. */
export const PortlessNameInvalid: Story = {
  args: { command: { ...DEV, portless: true, portlessName: 'front' } },
  play: async () => {
    const inside = dialog()
    const name = inside.getByRole('textbox', { name: 'Portless name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Front App')
    await waitFor(() => {
      expect(inside.getByText('Lowercase letters, digits and single dashes only.')).toHaveStyle({
        opacity: '1',
      })
    })
    await expect(inside.getByRole('button', { name: 'Save' })).toBeDisabled()
  },
}

/** Portless is not on this machine: the option is not drawn at all. */
export const PortlessMissing: Story = {
  args: { portlessInstalled: false },
  play: async () => {
    const inside = dialog()
    await expect(inside.getByLabelText('Scope')).toBeInTheDocument()
    await expect(inside.queryByRole('checkbox', { name: /Portless/ })).toBeNull()
  },
}

/** The line already calls portless: it runs as it is written, and the option is not drawn. */
export const PortlessInLine: Story = {
  args: { command: { ...DEV, command: 'portless front pnpm dev' } },
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    await expect(inside.queryByRole('checkbox', { name: /Portless/ })).toBeNull()
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        ...DEV,
        command: 'portless front pnpm dev',
        portless: false,
        portlessName: null,
      })
    })
  },
}

/**
 * Run when Hemera opens (#114): the box under the lines, off by default, says where it runs, and
 * ticking it is what is written.
 */
export const RunAtOpen: Story = {
  play: async ({ args }) => {
    args.onSubmit.mockClear()
    const inside = dialog()
    const atOpen = inside.getByRole('checkbox', { name: /^Run when Hemera opens/ })
    await expect(atOpen).not.toBeChecked()
    await expect(inside.getByText('Hemera runs it each time it opens, in main.')).toBeVisible()
    await userEvent.click(atOpen)
    await expect(atOpen).toBeChecked()
    await userEvent.click(inside.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith({ ...DEV, runAtOpen: true })
    })
  },
}

/** The engine refused: the dialog stays open on what was typed, and says why. */
export const Refused: Story = {
  args: { command: null, refusal: TAKEN },
  play: async () => {
    const inside = dialog()
    await userEvent.type(inside.getByRole('textbox', { name: 'Name' }), 'check')
    await userEvent.type(inside.getByRole('textbox', { name: 'Line' }), 'pnpm check')
    await userEvent.click(inside.getByRole('button', { name: 'Add command' }))
    await waitFor(() => {
      expect(inside.getByRole('alert')).toHaveTextContent(TAKEN)
    })
    await expect(inside.getByRole('textbox', { name: 'Line' })).toHaveValue('pnpm check')
    await waitFor(() => {
      expect(inside.getByRole('button', { name: 'Add command' })).toHaveStyle({ opacity: '1' })
    })
  },
}

/**
 * Every field in order, then Save and Cancel; Escape closes it and gives the focus back to what
 * opened it.
 */
export const Keyboard: Story = {
  args: { open: false, command: null },
  play: async ({ canvasElement, args }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Open the dialog' })
    opener.focus()
    await userEvent.keyboard('{Enter}')
    const inside = await waitFor(() => dialog())
    inside.getByRole('textbox', { name: 'Name' }).focus()
    await userEvent.keyboard('dev')
    await userEvent.tab()
    await expect(inside.getByLabelText('Type')).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByRole('checkbox', { name: 'A line per system' })).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByRole('textbox', { name: 'Line' })).toHaveFocus()
    await userEvent.keyboard('pnpm dev')
    await userEvent.tab()
    await expect(inside.getByRole('checkbox', { name: /^Run when Hemera opens/ })).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByLabelText('Runs from')).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByRole('textbox', { name: 'Folder' })).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByRole('button', { name: 'Add command' })).toHaveFocus()
    await userEvent.tab()
    await expect(inside.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(args.onOpenChange).toHaveBeenCalledWith(false)
    })
    await waitFor(() => {
      expect(opener).toHaveFocus()
    })
  },
}

/**
 * Choosing Portless brings its name in with the dialog around it (issue #183): the room under the
 * box grows while what it holds fades in, the dialog grows with it on the same beat, and unticking
 * the box folds both back to where they were.
 */
export const PortlessArrives: Story = {
  play: async () => {
    const inside = dialog()
    const box = inside.getByRole('checkbox', { name: /Serve through Portless/ })
    const frame = within(document.body).getByRole('dialog')
    const height = (): number => frame.getBoundingClientRect().height
    const from = height()

    const untick = async (): Promise<void> => {
      await userEvent.click(box)
      await waitFor(() => {
        expect(inside.queryByRole('textbox', { name: 'Portless name' })).toBeNull()
      })
      await waitFor(() => {
        expect(height()).toBeCloseTo(from, 0)
      })
    }

    /**
     * Ticks the box and watches, on every frame, the room the name arrives in and the dialog
     * around it.
     *
     * The room is what travels, from none of what it holds to all of it, and whether it travelled
     * or was drawn open is told by the clock (see `journey.ts`): a machine that gave no frame while
     * the spring played has seen nothing either way, and the box is unticked and ticked again, up
     * to five times. The dialog is what follows. It stops at the tallest a dialog may be after the
     * first twenty pixels of the way, which a spring covers between two frames of a busy machine,
     * so what is asked of it is to keep the room's beat: on no frame taller than the room has made
     * room for. A dialog that jumped to the name's height would be, while the room is opening.
     */
    const arrive = async (tries: number): Promise<{ room: Journey; ahead: number[] }> => {
      const rooms = new Set(frame.querySelectorAll('[data-reveal]'))
      const arriving = (): Element | undefined =>
        [...frame.querySelectorAll('[data-reveal]')].find((one) => !rooms.has(one))
      const ahead: number[] = []
      // How much of what it holds the room shows, in hundredths — a little over a hundred once
      // open, the room keeping a little space around what it holds.
      const watch = readEveryFrame(() => {
        const room = arriving()
        const open = room?.getBoundingClientRect().height ?? 0
        const grown = height() - from
        if (grown > open + 1) ahead.push(grown - open)
        const held = room?.firstElementChild?.getBoundingClientRect().height ?? 0
        return held === 0 ? 0 : (100 * open) / held
      })
      await userEvent.click(box)
      const name = await waitFor(() => inside.getByRole('textbox', { name: 'Portless name' }))
      // It lands in full: the room as tall as what it holds, faded all the way in, and the dialog
      // the same height from one frame to the next.
      await waitFor(() => {
        expect(getComputedStyle(name.closest('[data-reveal]')!).filter).toBe('opacity(1)')
      })
      await waitFor(async () => {
        const before = height()
        await nextFrame()
        expect(height()).toBe(before)
        expect(before).toBeGreaterThan(from + 1)
      })
      const readings = watch.stop()
      const room = journeyOf(readings, 0, readings.at(-1)?.value ?? 0)
      if (room !== 'unseen' || tries === 1) return { room, ahead }
      await untick()
      return arrive(tries - 1)
    }

    const { room, ahead } = await arrive(movesLess() ? 1 : 5)
    expect(ahead, 'the dialog grew ahead of the room the Portless name arrives in').toEqual([])
    if (!movesLess()) {
      expect(room, 'the room of the Portless name was drawn open, with no way').toBe('travelled')
    }

    await untick()
  },
}
