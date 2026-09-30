import { cn } from 'cn'
import type { KeyboardEvent, ReactNode } from 'react'

import { Card } from '../../components/card/card.tsx'
import { Select } from '../../components/select/select.tsx'
import { IconCircleDashed, IconPencil } from '../../icons.ts'
import { Reveal } from '../../reveal.tsx'
import {
  type CliState,
  type DeliveryRules,
  POLICIES,
  POLICY_LABELS,
  POLICY_STEPS,
  type Policy,
  type StepMode,
  policyOf,
  stepsOf,
} from './model.ts'
import {
  ClosureRows,
  Labelled,
  ForgeCard,
  FORM,
  MergeFields,
  MODE_ITEMS,
  PullRequestFields,
  ReviewFields,
  STEP_ICONS,
} from './parts.tsx'

/**
 * A · Policy — one choice among the five policies of #76, and the fields of the one chosen,
 * growing under it. Every step starts the same way; the closure and the cleanup close the page.
 */

const TILES = 'grid grid-cols-5 gap-2'

const TILES_WITH_CUSTOM = 'grid grid-cols-6 gap-2'

const TILE =
  'flex min-w-0 flex-col items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground outline-none focus-ring hover:bg-muted aria-checked:border-primary aria-checked:text-foreground disabled:opacity-50 disabled:hover:bg-card'

/** The arrows that walk the tiles, and which way. */
const ARROWS = new Map<string, 1 | -1>([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
])

const CHAIN = 'flex items-center gap-1'

const SUB = 'flex flex-col gap-3 border-t border-border pt-4'

const SUB_TITLE = 'text-sm font-medium text-foreground'

/** The policy of each tile as the icon, or the chain of the icons of its steps. */
function Chain({ policy }: { policy: Policy }): ReactNode {
  const kinds = POLICY_STEPS[policy]
  if (kinds.length === 0) return <IconCircleDashed size="sm" aria-hidden="true" />
  return (
    <span className={CHAIN} aria-hidden="true">
      {kinds.map((kind) => {
        const Icon = STEP_ICONS[kind]
        return <Icon key={kind} size="sm" />
      })}
    </span>
  )
}

/**
 * The five policies as one choice. `custom` adds a sixth tile, chosen when the steps were changed
 * by hand into none of the five, and never chosen by a press.
 */
export function PolicyChooser({
  value,
  onChange,
  custom = false,
}: {
  value: Policy | null
  onChange: (policy: Policy) => void
  custom?: boolean
}): ReactNode {
  const index = value === null ? -1 : POLICIES.indexOf(value)
  const walk = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = ARROWS.get(event.key)
    if (by === undefined) return
    event.preventDefault()
    const next = POLICIES[(Math.max(index, 0) + by + POLICIES.length) % POLICIES.length]
    if (next === undefined) return
    onChange(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-policy="${next}"]`)?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label="Policy"
      className={custom ? TILES_WITH_CUSTOM : TILES}
      onKeyDown={walk}
    >
      {POLICIES.map((policy) => (
        <button
          key={policy}
          type="button"
          role="radio"
          data-policy={policy}
          aria-checked={value === policy}
          tabIndex={value === policy || (value === null && policy === 'nothing') ? 0 : -1}
          className={TILE}
          onClick={() => onChange(policy)}
        >
          <Chain policy={policy} />
          <span className="truncate">{POLICY_LABELS[policy]}</span>
        </button>
      ))}
      {custom && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          disabled={value !== null}
          tabIndex={-1}
          className={TILE}
        >
          <IconPencil size="sm" aria-hidden="true" />
          <span className="truncate">Custom</span>
        </button>
      )}
    </div>
  )
}

export function PolicyVariant({
  rules,
  cli,
  onChange,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  const policy = policyOf(rules.steps) ?? 'review'
  const reached = POLICIES.indexOf(policy)
  const mode: StepMode = rules.steps[0]?.mode ?? 'auto'
  return (
    <>
      <ForgeCard rules={rules} cli={cli} onChange={onChange} />
      <Card title="Policy">
        <div className={FORM}>
          <PolicyChooser
            value={policy}
            onChange={(next) => onChange({ steps: stepsOf(next, mode) })}
          />
          <Reveal shown={reached > 0} gap="4">
            <div className="flex max-w-sm">
              <Labelled label="Starts after Accept" className="min-w-0 flex-1">
                <Select
                  label="Starts after Accept"
                  value={mode}
                  onValueChange={(next) =>
                    onChange({
                      steps: rules.steps.map(({ id, kind }) => ({ id, kind, mode: next })),
                    })
                  }
                  items={MODE_ITEMS}
                />
              </Labelled>
            </div>
          </Reveal>
          <Reveal shown={reached >= POLICIES.indexOf('pull-request')} gap="4">
            <div className={cn(SUB)}>
              <h3 className={SUB_TITLE}>Pull request</h3>
              <PullRequestFields rules={rules} onChange={onChange} />
            </div>
          </Reveal>
          <Reveal shown={reached >= POLICIES.indexOf('review')} gap="4">
            <div className={SUB}>
              <h3 className={SUB_TITLE}>Review</h3>
              <ReviewFields rules={rules} onChange={onChange} />
            </div>
          </Reveal>
          <Reveal shown={reached >= POLICIES.indexOf('merge')} gap="4">
            <div className={SUB}>
              <h3 className={SUB_TITLE}>Merge</h3>
              <MergeFields rules={rules} onChange={onChange} />
            </div>
          </Reveal>
        </div>
      </Card>
      <Card title="Afterwards">
        <ClosureRows
          offerCleanup={rules.offerCleanup}
          onOfferCleanup={(offerCleanup) => onChange({ offerCleanup })}
        />
      </Card>
    </>
  )
}
