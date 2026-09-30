import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { Card, CardRow } from '../../components/card/card.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Select } from '../../components/select/select.tsx'
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconX } from '../../icons.ts'
import { Reveal } from '../../reveal.tsx'
import {
  type CliState,
  type DeliveryRules,
  type RuleStep,
  type StepKind,
  type StepMode,
  ruleSentence,
} from './model.ts'
import {
  ClosureRows,
  Labelled,
  ForgeCard,
  FORM,
  MARK,
  MergeFields,
  MODE_ITEMS,
  ModeMark,
  NOTE,
  PullRequestFields,
  ReviewFields,
  SENTENCE,
  STEP_ICONS,
  STEP_LABELS,
} from './parts.tsx'

/**
 * B · Steps — the rules are an ordered list, the way the preparation of a Workspace is: one row
 * per step read as its sentence, its mark for how it starts, moved up and down, edited in one
 * dialog. The closure and the cleanup close the list, locked.
 */

const KINDS: StepKind[] = ['push', 'pull-request', 'review', 'merge']

export interface StepListProps {
  rules: DeliveryRules
  onChange: (next: Partial<DeliveryRules>) => void
  /** Opens the dialog on this step, or on a new one. */
  onEdit: (step: RuleStep | null) => void
}

/** The ordered list of the steps, and the two closing rows under it. */
export function StepList({ rules, onChange, onEdit }: StepListProps): ReactNode {
  const { steps } = rules
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps]
    const [taken] = next.splice(index, 1)
    if (taken === undefined) return
    next.splice(index + by, 0, taken)
    onChange({ steps: next })
  }
  return (
    <div className={FORM}>
      {steps.length === 0 ? (
        <p className={NOTE}>The branch stays in the Workspace.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Steps">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[step.kind]
            const sentence = ruleSentence(step, rules)
            return (
              <li key={step.id}>
                <CardRow>
                  <span className={MARK}>
                    <Icon size="sm" aria-hidden="true" />
                  </span>
                  <span className={SENTENCE}>{sentence}</span>
                  <ModeMark mode={step.mode} />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconArrowUp size="sm" />}
                    aria-label={`Move up: ${sentence}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconArrowDown size="sm" />}
                    aria-label={`Move down: ${sentence}`}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconPencil size="sm" />}
                    aria-label={`Edit: ${sentence}`}
                    onClick={() => onEdit(step)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconX size="sm" />}
                    aria-label={`Remove: ${sentence}`}
                    onClick={() => onChange({ steps: steps.filter((one) => one.id !== step.id) })}
                  />
                </CardRow>
              </li>
            )
          })}
        </ul>
      )}
      <ClosureRows
        offerCleanup={rules.offerCleanup}
        onOfferCleanup={(offerCleanup) => onChange({ offerCleanup })}
      />
    </div>
  )
}

/** What the dialog holds while it is open. */
interface Editing {
  id: string | null
  kind: StepKind
  mode: StepMode
}

/**
 * The dialog of one step: what it does, how it starts, and the fields of its kind. The fields are
 * the Project's, shared by every step that reads them.
 */
export function StepDialog({
  open,
  onOpenChange,
  editing,
  rules,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Editing
  rules: DeliveryRules
  onSave: (step: Editing, fields: Partial<DeliveryRules>) => void
}): ReactNode {
  const [step, setStep] = useState(editing)
  const [fields, setFields] = useState<Partial<DeliveryRules>>({})
  const [was, setWas] = useState(editing)
  // Opened anew on another step: the dialog outlives its openings.
  if (was !== editing) {
    setWas(editing)
    setStep(editing)
    setFields({})
  }
  const shown = { ...rules, ...fields }
  const change = (next: Partial<DeliveryRules>) => setFields({ ...fields, ...next })
  const taken = new Set(rules.steps.filter((one) => one.id !== step.id).map((one) => one.kind))
  return (
    <Dialog
      title={step.id === null ? 'Add step' : 'Edit step'}
      open={open}
      onOpenChange={onOpenChange}
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => {
              onSave(step, fields)
              onOpenChange(false)
            }}
          >
            {step.id === null ? 'Add' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <div className={FORM}>
        <div className="flex flex-wrap items-end gap-3">
          <Labelled label="Step" className="min-w-0 flex-1">
            <Select
              label="Step"
              value={step.kind}
              onValueChange={(kind) => setStep({ ...step, kind })}
              items={KINDS.map((kind) => {
                const Icon = STEP_ICONS[kind]
                return {
                  value: kind,
                  label: STEP_LABELS[kind],
                  icon: <Icon size="sm" />,
                  disabled: taken.has(kind),
                }
              })}
            />
          </Labelled>
          <Labelled label="Starts" className="min-w-0 flex-1">
            <Select
              label="Starts"
              value={step.mode}
              onValueChange={(mode) => setStep({ ...step, mode })}
              items={MODE_ITEMS}
            />
          </Labelled>
        </div>
        <Reveal shown={step.kind === 'pull-request'} gap="4">
          <PullRequestFields rules={shown} onChange={change} />
        </Reveal>
        <Reveal shown={step.kind === 'review'} gap="4">
          <ReviewFields rules={shown} onChange={change} />
        </Reveal>
        <Reveal shown={step.kind === 'merge'} gap="4">
          <MergeFields rules={shown} onChange={change} />
        </Reveal>
      </div>
    </Dialog>
  )
}

const NEW: Editing = { id: null, kind: 'push', mode: 'auto' }

export interface StepDialogHandle {
  /** Opens the dialog on a step, or on a new one. */
  edit: (step: RuleStep | null) => void
  /** Whether every kind of step is in the list already. */
  full: boolean
  dialog: ReactNode
}

/**
 * The dialog of the steps and what opens it, held together: what B draws, and what C opens under
 * its presets.
 */
export function useStepDialog(
  rules: DeliveryRules,
  onChange: (next: Partial<DeliveryRules>) => void,
  /** The step the dialog is open on at first, for a story; `'new'` for a new one. */
  dialogOn: string | null = null,
): StepDialogHandle {
  const first = dialogOn === 'new' ? NEW : (rules.steps.find((one) => one.id === dialogOn) ?? null)
  const [editing, setEditing] = useState<Editing>(first ?? NEW)
  const [open, setOpen] = useState(first !== null)
  const free = KINDS.find((kind) => !rules.steps.some((one) => one.kind === kind))
  return {
    full: free === undefined,
    edit: (step) => {
      setEditing(step ?? { ...NEW, kind: free ?? 'push' })
      setOpen(true)
    },
    dialog: (
      <StepDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        rules={rules}
        onSave={(step, fields) => {
          const steps =
            step.id === null
              ? [...rules.steps, { id: step.kind, kind: step.kind, mode: step.mode }]
              : rules.steps.map((one) =>
                  one.id === step.id ? { id: one.id, kind: step.kind, mode: step.mode } : one,
                )
          onChange({ ...fields, steps })
        }}
      />
    ),
  }
}

/** The button that adds a step, in the corner of the card that holds the list. */
export function AddStep({ full, onAdd }: { full: boolean; onAdd: () => void }): ReactNode {
  return (
    <Button variant="secondary" size="sm" disabled={full} onClick={onAdd}>
      <IconPlus size="sm" aria-hidden="true" />
      Add step
    </Button>
  )
}

export function StepsVariant({
  rules,
  cli,
  onChange,
  dialogOn,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
  dialogOn?: string | null | undefined
}): ReactNode {
  const steps = useStepDialog(rules, onChange, dialogOn ?? null)
  return (
    <>
      <ForgeCard rules={rules} cli={cli} onChange={onChange} />
      <Card title="Steps" actions={<AddStep full={steps.full} onAdd={() => steps.edit(null)} />}>
        <StepList rules={rules} onChange={onChange} onEdit={steps.edit} />
        {steps.dialog}
      </Card>
    </>
  )
}
