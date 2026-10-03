import { cn } from 'cn'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { Checkbox } from '../../components/checkbox/checkbox.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Input, Textarea } from '../../components/field/field.tsx'
import { Select } from '../../components/select/select.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconRestore } from '../../icons.ts'
import { Reveal } from '../../reveal.tsx'
import {
  type DeliveryRules,
  type Forge,
  type MergeMethod,
  type RuleStep,
  type StepConfig,
  type StepKind,
  configOf,
  partsOf,
  rowsOf,
} from './model.ts'
import {
  FORM,
  GROW,
  KIND_GROUPS,
  Labelled,
  MODE_ITEMS,
  ROW_LINE,
  STEP_ICONS,
  STEP_LABELS,
} from './parts.tsx'

/**
 * The dialog of one step: its kind (for a new one), how it starts, and its fields. Opened on a
 * repository, it edits that repository's copy of the step, and every field that differs from the
 * base wears a dot and a way back to the base value.
 */

/** What the dialog is open on. */
export interface Editing {
  /** `base` for the Project's own steps, or the repository whose copy it edits. */
  scope: string
  /** The step as it stands; a new one has an id the list has not. */
  step: RuleStep
  /** Whether the step is not in the list yet. */
  added: boolean
  /** The base's own version, when a repository edits a base step. */
  base: RuleStep | null
  /** For a repository's own new step: the step it comes after. */
  after: string | null
}

export const BASE_SCOPE = 'base'

const CATALOGUE = ['changeset', 'bump:kit', 'storybook:shots', 'lint'].map((value) => ({
  value,
  label: value,
}))

const METHOD_ITEMS: { value: MergeMethod; label: string }[] = [
  { value: 'squash', label: 'Squash' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
]

const APPROVAL_ITEMS = ['1', '2', '3'].map((value) => ({ value, label: value }))

/** What differs from the base: the one tint the rules use for a repository's own changes. */
export const CHANGED_DOT = 'size-2 shrink-0 rounded-full bg-primary'

/** A field, and beside it, when it differs from the base, a dot and the way back to the base. */
function Differs({
  differs,
  onReset,
  className,
  children,
}: {
  differs: boolean
  onReset: () => void
  className?: string | undefined
  children: ReactNode
}): ReactNode {
  return (
    <div className={cn('flex items-end gap-1', className)}>
      <div className={GROW}>{children}</div>
      {differs && (
        <span className="flex h-control-md shrink-0 items-center gap-1">
          <span aria-hidden="true" className={CHANGED_DOT} />
          <Tooltip label="Back to the base">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconRestore size="sm" />}
              aria-label="Back to the base"
              onClick={onReset}
            />
          </Tooltip>
        </span>
      )}
    </div>
  )
}

/** The fields of a step's kind. `base` is the base's version of the same kind, or null. */
function Fields({
  config,
  base,
  forge,
  others,
  onChange,
}: {
  config: StepConfig
  base: StepConfig | null
  forge: Forge
  /** The other repositories, for a release to wait on. */
  others: readonly string[]
  onChange: (next: StepConfig) => void
}): ReactNode {
  switch (config.kind) {
    case 'push':
    case 'ci':
      return null
    case 'pull-request': {
      const was = base?.kind === config.kind ? base : null
      return (
        <div className={FORM}>
          <div className={ROW_LINE}>
            <Differs
              className="w-24"
              differs={was !== null && was.into !== config.into}
              onReset={() => was !== null && onChange({ ...config, into: was.into })}
            >
              <Input
                label="Into"
                value={config.into}
                onValueChange={(into) => onChange({ ...config, into })}
              />
            </Differs>
            <Differs
              className={GROW}
              differs={was !== null && was.title !== config.title}
              onReset={() => was !== null && onChange({ ...config, title: was.title })}
            >
              <Input
                label="Title"
                value={config.title}
                onValueChange={(title) => onChange({ ...config, title })}
              />
            </Differs>
          </div>
          <Differs
            differs={was !== null && was.body !== config.body}
            onReset={() => was !== null && onChange({ ...config, body: was.body })}
          >
            <Textarea
              label="Body"
              rows={4}
              value={config.body}
              onValueChange={(body) => onChange({ ...config, body })}
            />
          </Differs>
          <Checkbox
            label="Draft"
            checked={config.draft}
            onCheckedChange={(draft) => onChange({ ...config, draft })}
          />
        </div>
      )
    }
    case 'screenshots':
      return (
        <div className={ROW_LINE}>
          <Labelled label="From" className={GROW}>
            <Select
              label="From"
              value={config.source}
              onValueChange={(source) => onChange({ ...config, source })}
              items={[
                { value: 'round', label: 'The review round' },
                { value: 'agent', label: 'The agent, through Playwright' },
              ]}
            />
          </Labelled>
          {forge === 'github' && (
            <Labelled label="Uploaded as" className={GROW}>
              <Select
                label="Uploaded as"
                value={config.upload}
                onValueChange={(upload) => onChange({ ...config, upload })}
                items={[
                  { value: 'comment', label: 'A comment' },
                  { value: 'branch', label: 'Files in the branch' },
                ]}
              />
            </Labelled>
          )}
        </div>
      )
    case 'review': {
      const was = base?.kind === config.kind ? base : null
      return (
        <div className={ROW_LINE}>
          <Differs
            className={GROW}
            differs={was !== null && was.reviewers.join() !== config.reviewers.join()}
            onReset={() => was !== null && onChange({ ...config, reviewers: was.reviewers })}
          >
            <Input
              label="Reviewers"
              value={config.reviewers.join(', ')}
              onValueChange={(typed) =>
                onChange({
                  ...config,
                  reviewers: typed
                    .split(',')
                    .map((one) => one.trim())
                    .filter((one) => one !== ''),
                })
              }
            />
          </Differs>
          <Differs
            className="w-24"
            differs={was !== null && was.approvals !== config.approvals}
            onReset={() => was !== null && onChange({ ...config, approvals: was.approvals })}
          >
            <Labelled label="Approvals">
              <Select
                label="Approvals"
                value={String(config.approvals)}
                onValueChange={(value) => onChange({ ...config, approvals: Number(value) })}
                items={APPROVAL_ITEMS}
              />
            </Labelled>
          </Differs>
        </div>
      )
    }
    case 'merge': {
      const was = base?.kind === config.kind ? base : null
      return (
        <Differs
          className="max-w-sm"
          differs={was !== null && was.method !== config.method}
          onReset={() => was !== null && onChange({ ...config, method: was.method })}
        >
          <Labelled label="Method">
            <Select
              label="Method"
              value={config.method}
              onValueChange={(method) => onChange({ ...config, method })}
              items={METHOD_ITEMS}
            />
          </Labelled>
        </Differs>
      )
    }
    case 'release':
      return (
        <div className={FORM}>
          <div className={ROW_LINE}>
            <Labelled label="Of" className="w-24">
              <Select
                label="Of"
                value={config.of}
                onValueChange={(of) => onChange({ ...config, of })}
                items={others.map((one) => ({ value: one, label: one }))}
              />
            </Labelled>
            <Labelled label="Seen by" className={GROW}>
              <Select
                label="Seen by"
                value={config.detect}
                onValueChange={(detect) => onChange({ ...config, detect })}
                items={[
                  { value: 'registry', label: 'A new version on the registry' },
                  { value: 'tag', label: 'A new tag' },
                  { value: 'manual', label: 'Your confirmation' },
                ]}
              />
            </Labelled>
          </div>
          <Reveal shown={config.detect !== 'manual'}>
            <Input
              label={config.detect === 'tag' ? 'Tag' : 'Package'}
              className="max-w-sm"
              value={config.pattern}
              onValueChange={(pattern) => onChange({ ...config, pattern })}
            />
          </Reveal>
        </div>
      )
    case 'bump':
      return (
        <div className={FORM}>
          <div className={ROW_LINE}>
            <Input
              label="Dependency"
              className="min-w-0 flex-1"
              value={config.dependency}
              onValueChange={(dependency) => onChange({ ...config, dependency })}
            />
            <Labelled label="By" className={GROW}>
              <Select
                label="By"
                value={config.how}
                onValueChange={(how) => onChange({ ...config, how })}
                items={[
                  { value: 'command', label: 'A command' },
                  { value: 'agent', label: 'The agent' },
                ]}
              />
            </Labelled>
          </div>
          <Reveal shown={config.how === 'command'}>
            <Labelled label="Command" className="max-w-sm">
              <Select
                label="Command"
                value={config.command}
                onValueChange={(command) => onChange({ ...config, command })}
                items={CATALOGUE}
              />
            </Labelled>
          </Reveal>
        </div>
      )
    case 'confirm':
      return (
        <Input
          label="What"
          value={config.what}
          onValueChange={(what) => onChange({ ...config, what })}
        />
      )
    case 'command':
      return (
        <Labelled label="Command" className="max-w-sm">
          <Select
            label="Command"
            value={config.command}
            onValueChange={(command) => onChange({ ...config, command })}
            items={CATALOGUE}
          />
        </Labelled>
      )
    case 'agent':
      return (
        <Textarea
          label="Task"
          rows={3}
          value={config.task}
          onValueChange={(task) => onChange({ ...config, task })}
        />
      )
  }
}

/** A title for the dialog: the step and where it applies. */
function titleOf(editing: Editing): string {
  const what = editing.added ? 'Add step' : partsOf(editing.step.config).what
  return editing.scope === BASE_SCOPE ? what : `${what} · ${editing.scope}`
}

export function StepDialog({
  open,
  onOpenChange,
  editing: first,
  rules,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Editing
  rules: DeliveryRules
  onSave: (editing: Editing) => void
}): ReactNode {
  const [editing, setEditing] = useState(first)
  const [was, setWas] = useState(first)
  // Opened anew on another step: the dialog outlives its openings.
  if (was !== first) {
    setWas(first)
    setEditing(first)
  }
  const { step, base } = editing
  const setStep = (next: Partial<RuleStep>) =>
    setEditing({ ...editing, step: { ...step, ...next } })
  const others = rules.repositories.map((one) => one.name).filter((one) => one !== editing.scope)
  // A repository's own new step comes after one of the steps it runs.
  const anchors =
    editing.scope === BASE_SCOPE || !editing.added
      ? []
      : rowsOf(rules).filter((row) =>
          row.cells.some((cell) => cell.repository === editing.scope && cell.step !== null),
        )
  return (
    <Dialog
      title={titleOf(editing)}
      size="wide"
      open={open}
      onOpenChange={onOpenChange}
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => {
              onSave(editing)
              onOpenChange(false)
            }}
          >
            {editing.added ? 'Add' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <div className={FORM}>
        <div className={ROW_LINE}>
          {editing.added && (
            <Labelled label="Step" className={GROW}>
              <Select
                label="Step"
                value={step.config.kind}
                onValueChange={(kind: StepKind) => setStep({ config: configOf(kind) })}
                items={KIND_GROUPS.map((kinds, index) => ({
                  label: ['Git and the forge', 'Waits', 'Custom'][index] ?? '',
                  items: kinds.map((kind) => {
                    const Icon = STEP_ICONS[kind]
                    return { value: kind, label: STEP_LABELS[kind], icon: <Icon size="sm" /> }
                  }),
                }))}
              />
            </Labelled>
          )}
          <Differs
            className={GROW}
            differs={base !== null && base.mode !== step.mode}
            onReset={() => base !== null && setStep({ mode: base.mode })}
          >
            <Labelled label="Starts">
              <Select
                label="Starts"
                value={step.mode}
                onValueChange={(mode) => setStep({ mode })}
                items={MODE_ITEMS}
              />
            </Labelled>
          </Differs>
          {anchors.length > 0 && (
            <Labelled label="After" className={GROW}>
              <Select
                label="After"
                value={editing.after ?? '—'}
                onValueChange={(after) =>
                  setEditing({ ...editing, after: after === '—' ? null : after })
                }
                items={[
                  { value: '—', label: '—' },
                  ...anchors.map((row) => ({
                    value: row.step.id,
                    label: partsOf(row.step.config).what,
                  })),
                ]}
              />
            </Labelled>
          )}
        </div>
        <Fields
          config={step.config}
          base={base?.config ?? null}
          forge={rules.forge}
          others={others}
          onChange={(config) => setStep({ config })}
        />
      </div>
    </Dialog>
  )
}

/** The rules with what the dialog saved laid in. */
export function saved(rules: DeliveryRules, editing: Editing): DeliveryRules {
  const { scope, step } = editing
  if (scope === BASE_SCOPE) {
    return {
      ...rules,
      base: editing.added
        ? [...rules.base, step]
        : rules.base.map((one) => (one.id === step.id ? step : one)),
    }
  }
  return {
    ...rules,
    repositories: rules.repositories.map((repository) => {
      if (repository.name !== scope) return repository
      if (editing.base !== null) {
        const same =
          editing.base.mode === step.mode &&
          JSON.stringify(editing.base.config) === JSON.stringify(step.config)
        const changed = Object.fromEntries(
          Object.entries(repository.changed).filter(([id]) => id !== step.id),
        )
        return { ...repository, changed: same ? changed : { ...changed, [step.id]: step } }
      }
      return {
        ...repository,
        added: editing.added
          ? [...repository.added, { step, after: editing.after }]
          : repository.added.map((one) => (one.step.id === step.id ? { ...one, step } : one)),
      }
    }),
  }
}
