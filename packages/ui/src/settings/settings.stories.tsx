import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import { expectNeverBuried, watchThereAndBack } from '../../.storybook/sliding-mark.ts'
import type { ThemeChoice } from '../window.ts'
import {
  EVALUATION_ENGINES,
  type ClassifierSectionProps,
  type ClassifierMode,
  type CredentialStatus,
} from './classifier-section.tsx'
import type { StrictnessLevel } from './auto-strictness.tsx'
import {
  Settings,
  type ArchivedProject,
  type ProfileFacts,
  type SettingsProps,
  type SettingsSection,
} from './settings.tsx'

/**
 * The settings of the application, on fixtures (design D4-07).
 *
 * The Profile block is what `engine.status` answered, written out as it came: the page neither
 * measures the database nor counts the backups, it says what it was told.
 */
const FACTS: ProfileFacts = {
  directory: 'C:\\Users\\someone\\AppData\\Local\\hemera\\prod',
  database: 'hemera.sqlite · 1.2 MB',
  lastMigration: '20260916_projects_and_journal',
  writtenByVersion: '0.4.0-beta.3',
  backups: '2 · latest before 20260916_projects_and_journal',
}

const ARCHIVED: ArchivedProject[] = [
  { id: 'ml', name: 'ML playground', archivedAt: 'last week' },
  { id: 'shop', name: 'Legacy shop', archivedAt: 'in August' },
]

function Controlled({
  theme,
  archived,
  classifier,
  onThemeChange,
  onRestore,
  acpTrace,
  onAcpTraceChange,
  section,
  onSectionChange,
  ...rest
}: SettingsProps) {
  const [chosen, setChosen] = useState<ThemeChoice>(theme)
  // Kept here as the application keeps it, so that a link to a setting can open its section.
  const [shown, setShown] = useState<SettingsSection | undefined>(section)
  const [kept, setKept] = useState(archived)
  const [mode, setMode] = useState<ClassifierMode>(classifier?.mode ?? 'agent-default')
  const [engine, setEngine] = useState(classifier?.engine ?? 'jev')
  const [credential, setCredential] = useState<CredentialStatus>(
    classifier?.credential ?? 'missing',
  )
  const [consent, setConsent] = useState(classifier?.consent ?? false)
  const [strictness, setStrictness] = useState<StrictnessLevel>(classifier?.strictness ?? 'normal')
  const [tracing, setTracing] = useState(acpTrace ?? false)
  return (
    <Settings
      {...rest}
      section={shown}
      onSectionChange={(next) => {
        setShown(next)
        onSectionChange?.(next)
      }}
      acpTrace={tracing}
      onAcpTraceChange={(on) => {
        setTracing(on)
        onAcpTraceChange?.(on)
      }}
      classifier={
        classifier === undefined
          ? undefined
          : {
              ...classifier,
              mode,
              engine,
              credential,
              consent,
              strictness,
              credentialMessage:
                credential === 'invalid'
                  ? 'The key was rejected. Replace it to retry.'
                  : classifier.credentialMessage,
              onModeChange: (next) => {
                setMode(next)
                classifier.onModeChange(next)
              },
              onEngineChange: (next) => {
                setEngine(next)
                classifier.onEngineChange(next)
              },
              onConsentChange: (next) => {
                setConsent(next)
                classifier.onConsentChange(next)
              },
              onStrictnessChange: (next) => {
                setStrictness(next)
                classifier.onStrictnessChange(next)
              },
              onSaveKey: (key) => {
                setCredential(key === 'invalid' ? 'invalid' : 'saved')
                classifier.onSaveKey(key)
              },
              onRemoveKey: () => {
                setCredential('missing')
                classifier.onRemoveKey()
              },
            }
      }
      theme={chosen}
      onThemeChange={(next) => {
        setChosen(next)
        onThemeChange(next)
      }}
      archived={kept}
      onRestore={(id) => {
        setKept(kept.filter((project) => project.id !== id))
        onRestore(id)
      }}
    />
  )
}

/** What this machine has, as `agents.check` answered when the section was opened (D5-18). */
const AGENTS: SettingsProps['agents'] = {
  agents: [
    {
      id: 'claude',
      name: 'Claude Code',
      found: true,
      version: '2.0.31',
      authenticated: true,
      installHint: 'npm i -g @anthropic-ai/claude-code',
      loginHint: 'claude auth login',
      installer: 'npm',
      latest: '2.0.35',
      bare: {
        qualified: true,
        private:
          'its managed and policy settings and ~/.claude.json still load; Hemera does not read them.',
      },
    },
    {
      id: 'codex',
      name: 'Codex',
      found: true,
      version: '0.9.4',
      authenticated: false,
      installHint: 'npm i -g @openai/codex',
      loginHint: 'codex login',
      installer: 'pnpm',
      latest: '0.9.4',
      bare: {
        qualified: false,
        reason:
          'apply_patch has no configuration key, and the MCP resource tools appear as soon as an MCP server exists. Hemera would not see those calls, so this Session is not opened.',
      },
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      found: false,
      version: null,
      authenticated: false,
      installHint: 'npm i -g opencode-ai',
      loginHint: 'opencode auth login',
      installer: 'unknown',
      latest: null,
      bare: {
        qualified: true,
        private:
          '$HOME/.opencode, its managed configuration and a remote .well-known/opencode still load; Hemera does not read them.',
      },
    },
  ],
  checked: true,
  updating: null,
  output: {},
  onUpdate: fn(),
}

const CLASSIFIER: ClassifierSectionProps = {
  mode: 'agent-default',
  onModeChange: fn(),
  engine: 'jev',
  onEngineChange: fn(),
  credential: 'missing',
  evaluator: 'ready',
  consent: false,
  onConsentChange: fn(),
  strictness: 'normal',
  onStrictnessChange: fn(),
  onSaveKey: fn(),
  onRemoveKey: fn(),
}

const meta = {
  tags: ['autodocs', 'updated'],
  title: 'Surfaces/Settings',
  component: Settings,
  render: (args) => <Controlled {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    subtitle: 'Hemera Beta 0.4.0-beta.3 · channel beta',
    theme: 'dark',
    facts: FACTS,
    agents: AGENTS,
    classifier: CLASSIFIER,
    archived: ARCHIVED,
    onThemeChange: fn(),
    onOpenFolder: fn(),
    onOpenDiagnostic: fn(),
    onRestore: fn(),
    acpTrace: false,
    onAcpTraceChange: fn(),
    onSectionChange: fn(),
    decisions: [],
    onOpenSession: fn(),
  },
  argTypes: {
    subtitle: { control: 'text', description: 'The product, its version and its channel.' },
    agents: { control: 'object', description: 'What this machine has, and its one press.' },
    theme: {
      control: 'inline-radio',
      options: ['system', 'light', 'dark'],
      description: 'What the user chose, which is one more than what the window wears.',
    },
    facts: { control: 'object', description: 'What the engine reported, word for word.' },
    archived: { control: 'object', description: 'The Projects taken out of the bar.' },
    onThemeChange: { action: 'theme changed' },
    onOpenFolder: { action: 'folder opened' },
    onOpenDiagnostic: { action: 'diagnostic opened' },
    onRestore: { action: 'restored' },
    acpTrace: {
      control: 'boolean',
      description: 'Whether the ACP trace of each Session is written.',
    },
    onAcpTraceChange: { action: 'trace turned on or off' },
    defaultSection: {
      control: 'select',
      options: ['appearance', 'agents', 'hemera-auto', 'archive', 'profile', 'developer'],
      description: 'The section shown first.',
    },
    section: { control: false, description: 'The section shown, for a caller that keeps it.' },
    onSectionChange: { action: 'section chosen' },
  },
} satisfies Meta<typeof Settings>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Everything in place, on Appearance: the navigation of five sections on the left, and one
 * section on screen at a time, as in Project settings.
 */
export const Complete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('tablist', { name: 'Settings' })
    await expect(
      within(nav)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Appearance', 'Agents', 'Hemera Auto', 'Archive', 'Profile', 'Developer'])
    await expect(canvas.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getAllByRole('tabpanel')).toHaveLength(1)
    await expect(canvas.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
    await expect(canvas.queryByText('Open the folder')).toBeNull()
  },
}

/** Agents: what this machine has, alone in its section. */
export const Agents: Story = {
  args: { defaultSection: 'agents' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: 'Agents' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getByText('Claude Code')).toBeVisible()
  },
}

/** Hemera Auto: the permission classifier and its engine, alone in their section. */
export const HemeraAuto: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: { ...CLASSIFIER, mode: 'hemera-auto', credential: 'saved', consent: true },
  },
}

/** Hemera Auto before the engine has answered: the section says so rather than hiding. */
export const HemeraAutoUnread: Story = {
  args: { defaultSection: 'hemera-auto', classifier: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: 'Hemera Auto' })).toBeVisible()
    await expect(canvas.getByText('Hemera Auto cannot be read yet.')).toBeVisible()
  },
}

/** Profile: the data folder as the engine reported it; the diagnostics are the Developer's. */
export const Profile: Story = {
  args: { defaultSection: 'profile' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('hemera.sqlite · 1.2 MB')).toBeVisible()
    await expect(canvas.queryByRole('checkbox', { name: /ACP trace/ })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Open diagnostic.log' })).toBeNull()
  },
}

/**
 * Developer, last: what Hemera does behind the scenes, one card per panel — Hemera Auto's latest
 * decisions across every Session, and the diagnostics.
 */
export const Developer: Story = {
  args: {
    defaultSection: 'developer',
    decisions: [
      {
        id: 'd1',
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
        record: '{ "answer": "allowed", "by": "judge" }',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('list', { name: 'Hemera Auto decisions' })).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: /Write an ACP trace of each Session/ }),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Open diagnostic.log' })).toBeVisible()
  },
}

/**
 * A link to a setting opens its section: the page is handed the section it is asked for, whatever
 * section was shown before, and it can still be left from there.
 */
export const ASettingPointedTo: Story = {
  args: { section: 'hemera-auto' },
  play: async ({ canvasElement, args }) => {
    args.onSectionChange?.mockClear()
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: 'Hemera Auto' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getByRole('radiogroup', { name: 'Permission classifier' })).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: 'Agents' }))
    await expect(args.onSectionChange).toHaveBeenCalledWith('agents')
    await waitFor(() => {
      expect(canvas.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true')
    })
  },
}

export const Playground: Story = {}

/** The three theme choices, one of them on, and the Profile as the engine reported it. */
export const Variants: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByRole('radio')).toHaveLength(3)
    expect(canvas.getByRole('radio', { name: 'Dark' })).toBeChecked()
  },
}

/** Scenario « Thème » of `specs/shell-navigation/spec.md`, as far as a page goes. */
export const States: Story = {
  play: async ({ canvasElement, args }) => {
    args.onThemeChange.mockClear()
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('radio', { name: 'Light' }))
    await waitFor(() => {
      expect(canvas.getByRole('radio', { name: 'Light' })).toBeChecked()
    })
    expect(args.onThemeChange).toHaveBeenCalledWith('light')
    expect(canvas.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
  },
}

/** A data folder nothing has been written into yet: every line says so rather than guessing. */
export const NothingWrittenYet: Story = {
  args: {
    facts: {
      directory: '/home/someone/.local/share/hemera/dev',
      database: 'hemera.sqlite · 24 KB',
      lastMigration: null,
      writtenByVersion: null,
      backups: null,
    },
    archived: [],
    defaultSection: 'profile',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('none yet')).toBeInTheDocument()
    expect(canvas.getByText('nobody yet')).toBeInTheDocument()
    expect(canvas.getByText('none taken yet')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('tab', { name: 'Archive' }))
    await waitFor(() => {
      expect(canvas.getByText(/No Project has been archived/)).toBeInTheDocument()
    })
  },
}

/** Scenario « Ouvrir le dossier » of `specs/shell-navigation/spec.md`, as far as a page goes. */
export const OpeningTheFolder: Story = {
  args: { defaultSection: 'profile' },
  play: async ({ canvasElement, args }) => {
    args.onOpenFolder.mockClear()
    args.onOpenDiagnostic.mockClear()
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Open the folder' }))
    expect(args.onOpenFolder).toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('tab', { name: 'Developer' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Open diagnostic.log' }))
    expect(args.onOpenDiagnostic).toHaveBeenCalled()
  },
}

/** Scenario « Restaurer un Projet » of `specs/shell-navigation/spec.md`. */
export const RestoringAProject: Story = {
  args: { defaultSection: 'archive' },
  play: async ({ canvasElement, args }) => {
    args.onRestore.mockClear()
    const canvas = within(canvasElement)

    // The page lists other things too — the agents of this machine, among them — so what is
    // restored is read off the rows that carry the press.
    const lines = canvas
      .getAllByRole('listitem')
      .filter((row) => within(row).queryByRole('button', { name: 'Restore' }) !== null)
    expect(lines).toHaveLength(2)
    await userEvent.click(within(lines[0]!).getByRole('button', { name: 'Restore' }))
    expect(args.onRestore).toHaveBeenCalledWith('ml')
    // It leaves the list it was restored from.
    await waitFor(() => {
      const left = canvas
        .getAllByRole('listitem')
        .filter((row) => within(row).queryByRole('button', { name: 'Restore' }) !== null)
      expect(left).toHaveLength(1)
    })
  },
}

/**
 * The navigation with the keyboard, as in Project settings: one stop, the arrows walk it and
 * show each section, Tab goes on into the section. The theme's segment is one stop too, and the
 * arrows move inside it.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    args.onSectionChange?.mockClear()
    const canvas = within(canvasElement)
    await userEvent.tab()
    const appearance = canvas.getByRole('tab', { name: 'Appearance' })
    await expect(appearance).toHaveFocus()

    await userEvent.tab()
    expect(canvas.getByRole('radio', { name: 'Dark' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => {
      expect(canvas.getByRole('radio', { name: 'System' })).toBeChecked()
    })

    appearance.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const auto = canvas.getByRole('tab', { name: 'Hemera Auto' })
    await expect(auto).toHaveFocus()
    await expect(auto).toHaveAttribute('aria-selected', 'true')
    await expect(args.onSectionChange).toHaveBeenCalledWith('hemera-auto')
    // A section left stays in the page, inert, until its leaving is over; the test's Tab does not
    // pass over an inert control the way the browser's does.
    await waitFor(() => {
      expect(canvas.getAllByRole('tabpanel')).toHaveLength(1)
    })
    await userEvent.tab()
    await expect(canvas.getByRole('radio', { name: /Agent default/ })).toHaveFocus()
    await expect(auto).toHaveAttribute('aria-selected', 'true')
  },
}

/** Agent default remains selected when a key is saved, and the mode is global. */
export const ClassifierSelection: Story = {
  args: { defaultSection: 'hemera-auto' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const defaultMode = canvas.getByRole('radio', { name: /Agent default/ })
    const auto = canvas.getByRole('radio', { name: /Hemera Auto/ })
    expect(defaultMode).toBeChecked()
    expect(canvas.queryByText('Data sent to TypeSafe AI')).toBeNull()
    await userEvent.click(auto)
    await waitFor(() => expect(auto).toBeChecked())
    expect(defaultMode).not.toBeChecked()
    expect(args.classifier?.onModeChange).toHaveBeenCalledWith('hemera-auto')
    expect(canvas.getByText('Data sent to TypeSafe AI')).toBeInTheDocument()
    await userEvent.click(defaultMode)
    await waitFor(() => expect(defaultMode).toBeChecked())
  },
}

/** The full key journey uses mock state and never holds a real credential. */
export const CredentialJourney: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: { ...CLASSIFIER, mode: 'hemera-auto', consent: true },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText('Jev API key')
    await userEvent.type(field, 'storybook-demo-key')
    await userEvent.click(canvas.getByRole('button', { name: 'Save key' }))
    expect(args.classifier?.onSaveKey).toHaveBeenCalledWith('storybook-demo-key')
    await waitFor(() => expect(canvas.getByRole('img', { name: 'Saved' })).toBeInTheDocument())
    expect(canvas.queryByText('Saved')).toBeNull()
    expect(canvas.getByRole('radio', { name: /Hemera Auto/ })).toBeChecked()
    await userEvent.type(field, 'replacement-demo-key')
    await userEvent.click(canvas.getByRole('button', { name: 'Replace key' }))
    expect(args.classifier?.onSaveKey).toHaveBeenCalledWith('replacement-demo-key')
    await userEvent.click(canvas.getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(canvas.getByRole('img', { name: 'Key required' })).toBeVisible())
    await expect(field).toHaveFocus()
    expect(args.classifier?.onRemoveKey).toHaveBeenCalled()
  },
}

/** Each state of Hemera Auto is a dot; its word is the dot's name and its hover, never a badge. */
export const MissingKey: Story = {
  args: { defaultSection: 'hemera-auto', classifier: { ...CLASSIFIER, mode: 'hemera-auto' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dot = canvas.getByRole('img', { name: 'Key required' })
    expect(dot).toHaveAttribute('title', 'Key required')
    expect(canvas.queryByText('Key required')).toBeNull()
  },
}

export const InvalidKey: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: {
      ...CLASSIFIER,
      mode: 'hemera-auto',
      credential: 'invalid',
      credentialMessage: 'The key was rejected. Replace it to retry.',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'Key rejected' })).toBeVisible()
    expect(canvas.queryByText('Key rejected')).toBeNull()
    expect(canvas.getByRole('alert')).toHaveTextContent('The key was rejected')
  },
}

export const StorageUnavailable: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: {
      ...CLASSIFIER,
      mode: 'hemera-auto',
      credential: 'storage-unavailable',
      credentialMessage: 'Protected credential storage is unavailable on this machine.',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'Protected storage unavailable' })).toBeVisible()
    expect(canvas.queryByText('Protected storage unavailable')).toBeNull()
    expect(canvas.getByLabelText('Jev API key')).toBeDisabled()
    expect(canvas.getByRole('button', { name: 'Save key' })).toBeDisabled()
  },
}

export const EvaluatorUnavailable: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: {
      ...CLASSIFIER,
      mode: 'hemera-auto',
      credential: 'saved',
      evaluator: 'unavailable',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'Evaluator unavailable' })).toBeVisible()
    expect(canvas.queryByText('Evaluator unavailable')).toBeNull()
  },
}

export const ConsentRequired: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: { ...CLASSIFIER, mode: 'hemera-auto', credential: 'saved', consent: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'Consent required' })).toBeVisible()
    await userEvent.click(canvas.getByRole('checkbox', { name: /Allow this evaluation data/ }))
    await waitFor(() => expect(canvas.getByRole('img', { name: 'Ready' })).toBeVisible())
    expect(canvas.queryByText('Ready')).toBeNull()
  },
}

export const TransitionPending: Story = {
  args: {
    defaultSection: 'hemera-auto',
    classifier: {
      ...CLASSIFIER,
      mode: 'hemera-auto',
      credential: 'saved',
      evaluator: 'transitioning',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'Changing across Sessions…' })).toBeVisible()
    expect(canvas.queryByText('Changing across Sessions…')).toBeNull()
    expect(canvas.getByRole('radio', { name: /Agent default/ })).toBeDisabled()
    expect(canvas.getByRole('radio', { name: /Hemera Auto/ })).toBeDisabled()
  },
}

/** A second injected engine fits the same single-choice list without a second mode toggle. */
export const ExtensibleEngine: Story = {
  name: 'The application classifier selector is accessible and extensible',
  args: {
    defaultSection: 'hemera-auto',
    classifier: {
      ...CLASSIFIER,
      mode: 'hemera-auto',
      credential: 'saved',
      engines: [
        ...EVALUATION_ENGINES,
        {
          id: 'fixture',
          label: 'Fixture engine',
          provider: 'Test only',
          description: 'A Storybook option.',
          available: true,
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /Fixture engine/ }))
    expect(args.classifier?.onEngineChange).toHaveBeenCalledWith('fixture')
    expect(canvas.getByRole('radio', { name: /Hemera Auto/ })).toBeChecked()
  },
}

/** The main choice is one keyboard group; engine selection stays below the selected mode. */
export const ClassifierKeyboard: Story = {
  args: { defaultSection: 'hemera-auto' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const defaultMode = canvas.getByRole('radio', { name: /Agent default/ })
    defaultMode.focus()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvas.getByRole('radio', { name: /Hemera Auto/ })).toBeChecked())
    expect(canvas.getByRole('radio', { name: /Hemera Auto/ })).toHaveFocus()
    expect(canvas.getByRole('radiogroup', { name: 'Evaluation engine' })).toBeVisible()
  },
}

/**
 * How often Hemera Auto asks when Jev judged a call: three levels, each with its icon, Normal
 * until the reader chooses another. The level is part of Hemera Auto and shows with it.
 */
export const Strictness: Story = {
  args: { classifier: { ...CLASSIFIER, mode: 'hemera-auto', consent: true, credential: 'saved' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByRole('radiogroup', { name: 'Strictness' })
    const levels = within(group).getAllByRole('radio')
    expect(levels.map((level) => level.textContent)).toEqual(['Careful', 'Normal', 'Permissive'])
    for (const level of levels) expect(level.querySelector('svg')).not.toBeNull()
    expect(within(group).getByRole('radio', { name: 'Normal' })).toBeChecked()
    await userEvent.click(within(group).getByRole('radio', { name: 'Permissive' }))
    await waitFor(() =>
      expect(within(group).getByRole('radio', { name: 'Permissive' })).toBeChecked(),
    )
    expect(args.classifier?.onStrictnessChange).toHaveBeenCalledWith('permissive')
    await userEvent.click(within(group).getByRole('radio', { name: 'Careful' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Careful' })).toBeChecked())
    expect(args.classifier?.onStrictnessChange).toHaveBeenCalledWith('careful')
  },
}

/** Under Agent default there is no level to choose: it belongs to Hemera Auto. */
export const StrictnessHidden: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByRole('radiogroup', { name: 'Strictness' })).toBeNull()
  },
}

/** The arrows move the level, as they move the theme. */
export const StrictnessKeyboard: Story = {
  args: { classifier: { ...CLASSIFIER, mode: 'hemera-auto' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByRole('radiogroup', { name: 'Strictness' })
    within(group).getByRole('radio', { name: 'Normal' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    const permissive = within(group).getByRole('radio', { name: 'Permissive' })
    await waitFor(() => expect(permissive).toBeChecked())
    expect(permissive).toHaveFocus()
    expect(args.classifier?.onStrictnessChange).toHaveBeenCalledWith('permissive')
  },
}

/**
 * The fill of the strictness segment crossing it, from one end to the other and back: on every
 * frame of the way it is drawn over the middle level and never under it (issue #127).
 */
export const StrictnessMarkCrossing: Story = {
  args: { classifier: { ...CLASSIFIER, mode: 'hemera-auto' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const segment = canvas.getByRole('radiogroup', { name: 'Strictness' })
    const watched = await watchThereAndBack(
      segment,
      () => userEvent.click(within(segment).getByRole('radio', { name: 'Careful' })),
      () => userEvent.click(within(segment).getByRole('radio', { name: 'Permissive' })),
    )
    expect(within(segment).getByRole('radio', { name: 'Permissive' })).toBeChecked()
    expectNeverBuried(watched)
  },
}

/**
 * The ACP trace of each Session, off until the reader turns it on (issue #131), with the sentence
 * that says what it keeps and what it does not.
 */
export const TurningTheTraceOn: Story = {
  args: { defaultSection: 'developer' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', { name: /Write an ACP trace of each Session/ })
    expect(box).not.toBeChecked()
    expect(canvas.getByText(/written as their size only/)).toBeInTheDocument()

    await userEvent.click(box)
    await waitFor(() => {
      expect(box).toBeChecked()
    })
    expect(args.onAcpTraceChange).toHaveBeenCalledWith(true)
  },
}

/**
 * The fill of the theme's segment crossing it, from one end to the other and back: on every frame
 * of the way it is drawn over the middle choice and never under it (issue #127).
 */
export const MarkCrossing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const segment = canvas.getByRole('radiogroup', { name: 'Theme' })
    const watched = await watchThereAndBack(
      segment,
      () => userEvent.click(canvas.getByRole('radio', { name: 'System' })),
      () => userEvent.click(canvas.getByRole('radio', { name: 'Dark' })),
    )
    expect(canvas.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expectNeverBuried(watched)
  },
}

/**
 * The fill of the navigation crossing it, down to the last section and back up to the first: on
 * every frame of the way it is drawn over the sections it crosses and never under one (#127).
 */
export const NavigationMarkCrossing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const navigation = canvas.getByRole('tablist', { name: 'Settings' })
    const watched = await watchThereAndBack(
      navigation,
      () => userEvent.click(canvas.getByRole('tab', { name: 'Developer' })),
      () => userEvent.click(canvas.getByRole('tab', { name: 'Appearance' })),
    )
    expect(canvas.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true')
    expectNeverBuried(watched)
  },
}
