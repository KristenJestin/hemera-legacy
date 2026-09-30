import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { cn } from 'cn'
import { type FunctionComponent, type ReactNode, useState } from 'react'

import { AgentsSection, type AgentsSectionProps } from './agents-section.tsx'
import { ClassifierSection, type ClassifierSectionProps } from './classifier-section.tsx'
import { Button } from '../components/button/button.tsx'
import { Card } from '../components/card/card.tsx'
import { Checkbox } from '../components/checkbox/checkbox.tsx'
import { List, ListItem } from '../components/list/list.tsx'
import { OVER_MARK, SlidingMark } from '../components/sliding-mark/sliding-mark.tsx'
import {
  IconArchive,
  IconBrandHemeraAuto,
  IconCircleHalf2,
  IconDatabase,
  IconDeviceDesktop,
  IconFileText,
  IconFolderOpen,
  IconMoon,
  type IconProps,
  IconRestore,
  IconRobot,
  IconSun,
} from '../icons.ts'
import type { ThemeChoice } from '../window.ts'

/**
 * The settings of the application: what the window wears, where its data lives, and what was
 * archived out of the bar (design D4-07).
 *
 * Laid out as Project settings are (#294): a navigation on the left and one section on screen at
 * a time — Appearance, Agents, Hemera Auto, Archive and Profile — with the same tabs, the same
 * travelling fill and the same keys. A page that held them one under the other was a page read
 * by scrolling past the agents to reach the classifier. The section shown can be kept by the
 * caller, which is how a link to a setting opens its section.
 *
 * Nothing here is computed. The Profile block says what the engine reported, word for word —
 * a page that worked out how big a database is would be a page reading a file it must not
 * open — and the two buttons hand a closed choice back to the main process, never a path.
 */
const NOTE = 'text-sm text-muted-foreground'

/**
 * The three choices, drawn as one control: a segment, and one of them is always on. The mark is
 * placed against it and its layers stay inside it.
 */
const SEGMENT =
  'relative isolate inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1'

const CHOICE =
  'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground'

/** The choice that is on is drawn over the fill; the others are crossed by it. */
const CHOICE_ON = 'z-1 text-foreground'

/** What a choice says, drawn over the fill whichever choice the fill is crossing. */
const CHOICE_CONTENT = 'inline-flex items-center gap-1.5'

/**
 * The one fill of the segment, which slides from choice to choice.
 *
 * The same thing a tab strip does, and for the same reason: three fills that swap tell the eye
 * that something changed, one fill that travels tells it where it went. It is the segment's
 * `SlidingMark` and no choice's (issue #127): drawn after the three, it crosses the middle one
 * on its way from one end to the other and never goes under it.
 */
const CHOICE_MARK = 'absolute inset-0 rounded-md bg-card shadow-sm'

const ROW = 'flex flex-col gap-3 text-sm'

const PAIR = 'flex flex-wrap items-baseline gap-x-6 gap-y-1'

/** As wide as the longest key, so every value starts on the same column. */
const KEY = 'w-sidebar-collapse shrink-0 text-sm text-muted-foreground'

const VALUE = 'min-w-0 truncate font-mono text-sm'

/** Project settings' layout, read the same way: the navigation beside the one section shown. */
const LAYOUT = 'flex items-start gap-8'

/** The navigation, which the mark is placed against and whose layers stay inside it. */
const NAV = 'relative isolate flex w-menu-side shrink-0 flex-col gap-1'

/** The section chosen is drawn over the fill; the others are crossed by it. */
const NAV_ITEM =
  'relative flex h-control-md w-full items-center gap-2 rounded-md px-3 text-sm text-muted-foreground outline-none select-none focus-ring data-active:z-1 data-active:text-foreground'

/** What an entry says, drawn over the fill whichever entry the fill is crossing. */
const NAV_CONTENT = 'flex items-center gap-2'

/** The one fill of the navigation, which travels to the section chosen (#127). */
const NAV_MARK = 'absolute inset-0 rounded-md bg-accent'

const PANEL = 'flex min-w-0 flex-1 flex-col gap-4 outline-none'

/** The sections of the page, in the order the navigation lists them. */
export type SettingsSection = 'appearance' | 'agents' | 'hemera-auto' | 'archive' | 'profile'

const SECTIONS: {
  value: SettingsSection
  label: string
  icon: FunctionComponent<IconProps>
}[] = [
  { value: 'appearance', label: 'Appearance', icon: IconCircleHalf2 },
  { value: 'agents', label: 'Agents', icon: IconRobot },
  { value: 'hemera-auto', label: 'Hemera Auto', icon: IconBrandHemeraAuto },
  { value: 'archive', label: 'Archive', icon: IconArchive },
  { value: 'profile', label: 'Profile', icon: IconDatabase },
]

const THEMES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <IconDeviceDesktop size="sm" /> },
  { value: 'light', label: 'Light', icon: <IconSun size="sm" /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size="sm" /> },
]

export interface AppearanceSectionProps {
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
}

export function AppearanceSection({ theme, onThemeChange }: AppearanceSectionProps): ReactNode {
  return (
    <Card title="Appearance">
      <RadioGroup
        className={SEGMENT}
        aria-label="Theme"
        value={theme}
        onValueChange={(next) => {
          // SAFETY: the group only ever holds the three choices it renders, and `next` is the
          // one that was chosen; Base UI types a group's value as whatever was passed.
          onThemeChange(next as ThemeChoice)
        }}
      >
        {THEMES.map((choice) => (
          <Radio.Root
            key={choice.value}
            value={choice.value}
            data-mark={choice.value}
            // A real `<button>`, which is what the hand presses; told so, Base UI leaves out the
            // attributes it would have had to add for something that only looks like one.
            nativeButton
            render={<button type="button" />}
            className={cn(CHOICE, choice.value === theme && CHOICE_ON)}
          >
            <span className={cn(OVER_MARK, CHOICE_CONTENT)}>
              {choice.icon}
              {choice.label}
            </span>
          </Radio.Root>
        ))}
        {/* Last, so that it is drawn after every choice it can cross. */}
        <SlidingMark target={theme} shape={CHOICE_MARK} />
      </RadioGroup>
      <p className={NOTE}>
        Followed by the frame, the window buttons and every native control, not only the page.
      </p>
    </Card>
  )
}

/** Where the data folder stands, as the engine reports it and in its own words. */
export interface ProfileFacts {
  /** The folder itself, which the interface calls the Profile. */
  directory: string
  /** The database file and how big it is, already written. */
  database: string
  lastMigration: string | null
  writtenByVersion: string | null
  /** How many backups there are and which is the last, already written. */
  backups: string | null
}

export interface ProfileSectionProps {
  facts: ProfileFacts
  onOpenFolder: () => void
  onOpenDiagnostic: () => void
}

export function ProfileSection({
  facts,
  onOpenFolder,
  onOpenDiagnostic,
}: ProfileSectionProps): ReactNode {
  return (
    <Card title="Profile">
      <dl className={ROW}>
        {(
          [
            ['Folder', facts.directory],
            ['Database', facts.database],
            ['Last migration', facts.lastMigration ?? 'none yet'],
            ['Written by', facts.writtenByVersion ?? 'nobody yet'],
            ['Backups', facts.backups ?? 'none taken yet'],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className={PAIR}>
            <dt className={KEY}>{key}</dt>
            <dd className={VALUE}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenFolder}>
          <IconFolderOpen size="sm" />
          Open the folder
        </Button>
        <Button variant="secondary" size="sm" onClick={onOpenDiagnostic}>
          <IconFileText size="sm" />
          Open diagnostic.log
        </Button>
      </div>
    </Card>
  )
}

/**
 * What Hemera writes down to find out why an agent went quiet (issue #131).
 *
 * One switch, off unless turned on: the ACP trace of each Session, beside the diagnostic. A
 * conversation written to a file is not something a reader should find out about afterwards, so
 * the sentence under it says what is kept and what is not.
 */
function DiagnosticsSection({
  acpTrace,
  onAcpTraceChange,
}: {
  acpTrace: boolean
  onAcpTraceChange: (on: boolean) => void
}): ReactNode {
  return (
    <Card title="Diagnostics">
      <Checkbox
        checked={acpTrace}
        onCheckedChange={onAcpTraceChange}
        label="Write an ACP trace of each Session"
        description="Every message between Hemera and the agent, with its time, beside diagnostic.log. Prompts, files and secrets are written as their size only. Takes effect from the next message."
      />
    </Card>
  )
}

export interface ArchivedProject {
  id: string
  name: string
  /** When it was archived, already written for the platform. */
  archivedAt: string
}

export interface ArchivedProjectsProps {
  projects: ArchivedProject[]
  onRestore: (id: string) => void
}

/** What was taken out of the bar, and the one way back in. */
export function ArchivedProjects({ projects, onRestore }: ArchivedProjectsProps): ReactNode {
  return (
    <Card title="Archived Projects">
      {projects.length === 0 ? (
        <p className={NOTE}>No Project has been archived. Nothing is ever deleted.</p>
      ) : (
        <List label="Archived Projects">
          {projects.map((project) => (
            <ListItem
              key={project.id}
              icon={<IconArchive size="sm" />}
              title={project.name}
              description={`archived ${project.archivedAt}`}
              trailing={
                <Button variant="secondary" size="sm" onClick={() => onRestore(project.id)}>
                  <IconRestore size="sm" />
                  Restore
                </Button>
              }
            />
          ))}
        </List>
      )}
    </Card>
  )
}

export interface SettingsProps {
  /** What the window says it is: the product, its version and its channel. */
  subtitle: string
  /** What this machine has, and the one thing the reader can do about it (design D5-18). */
  agents: AgentsSectionProps
  /** Phase-0 stories supply controlled classifier fixtures; application wiring follows the UI gate. */
  classifier?: ClassifierSectionProps | undefined
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  facts: ProfileFacts
  onOpenFolder: () => void
  onOpenDiagnostic: () => void
  archived: ArchivedProject[]
  onRestore: (id: string) => void
  /** Whether the ACP trace of each Session is written (issue #131). Off unless turned on. */
  acpTrace?: boolean | undefined
  /** Turns it on or off; absent, the Diagnostics card is not drawn. */
  onAcpTraceChange?: ((on: boolean) => void) | undefined
  /** The section shown first; Appearance unless said otherwise. */
  defaultSection?: SettingsSection | undefined
  /** The section shown, for a caller that keeps it: a link to a setting opens its section. */
  section?: SettingsSection | undefined
  onSectionChange?: ((section: SettingsSection) => void) | undefined
}

export function Settings({
  subtitle,
  theme,
  onThemeChange,
  facts,
  onOpenFolder,
  onOpenDiagnostic,
  agents,
  classifier,
  archived,
  onRestore,
  acpTrace = false,
  onAcpTraceChange,
  defaultSection = 'appearance',
  section,
  onSectionChange,
}: SettingsProps): ReactNode {
  const [chosen, setChosen] = useState<SettingsSection>(defaultSection)
  const current = section ?? chosen

  const panels: Record<SettingsSection, ReactNode> = {
    appearance: <AppearanceSection theme={theme} onThemeChange={onThemeChange} />,
    agents: <AgentsSection {...agents} />,
    'hemera-auto':
      classifier === undefined ? (
        <p className={NOTE}>Hemera Auto cannot be read yet.</p>
      ) : (
        <ClassifierSection {...classifier} />
      ),
    archive: <ArchivedProjects projects={archived} onRestore={onRestore} />,
    profile: (
      <>
        <ProfileSection
          facts={facts}
          onOpenFolder={onOpenFolder}
          onOpenDiagnostic={onOpenDiagnostic}
        />
        {onAcpTraceChange === undefined ? null : (
          <DiagnosticsSection acpTrace={acpTrace} onAcpTraceChange={onAcpTraceChange} />
        )}
      </>
    ),
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className={NOTE}>{subtitle}</p>
      </div>
      <BaseTabs.Root
        orientation="vertical"
        value={current}
        onValueChange={(next: SettingsSection) => {
          setChosen(next)
          onSectionChange?.(next)
        }}
        className={LAYOUT}
      >
        <BaseTabs.List activateOnFocus aria-label="Settings" className={NAV}>
          {SECTIONS.map((one) => (
            <BaseTabs.Tab
              key={one.value}
              value={one.value}
              data-mark={one.value}
              className={NAV_ITEM}
            >
              <span className={cn(OVER_MARK, NAV_CONTENT)}>
                <one.icon size="sm" aria-hidden="true" />
                {one.label}
              </span>
            </BaseTabs.Tab>
          ))}
          {/* Last, so that it is drawn after every entry it can cross. */}
          <SlidingMark target={current} shape={NAV_MARK} />
        </BaseTabs.List>
        {SECTIONS.map((one) => (
          // Not a stop of the tab order of its own: the Tab key goes from the navigation to the
          // first control of the section.
          <BaseTabs.Panel key={one.value} value={one.value} tabIndex={-1} className={PANEL}>
            {panels[one.value]}
          </BaseTabs.Panel>
        ))}
      </BaseTabs.Root>
    </div>
  )
}
