import type { ReactNode } from 'react'
import { useState } from 'react'

import { Disclosure } from '../../activity/disclosure.tsx'
import { Card } from '../../components/card/card.tsx'
import { type CliState, type DeliveryRules, policyOf, stepsOf } from './model.ts'
import { ForgeCard, FORM, MARK, STEP_ICONS } from './parts.tsx'
import { PolicyChooser } from './variant-policy.tsx'
import { AddStep, StepList, useStepDialog } from './variant-steps.tsx'

/**
 * C · Presets — the five policies as presets, one press each, and under them the steps they
 * amount to, folded: the same list as B, where a step is moved, set to wait for a click, or
 * removed. A list changed into none of the five is the sixth tile, Custom.
 */

const SUMMARY = 'flex items-center gap-2 text-sm'

export function PresetsVariant({
  rules,
  cli,
  onChange,
  stepsOpen = false,
  dialogOn,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
  /** Whether the steps are unfolded at first. */
  stepsOpen?: boolean | undefined
  dialogOn?: string | null | undefined
}): ReactNode {
  const policy = policyOf(rules.steps)
  const steps = useStepDialog(rules, onChange, dialogOn ?? null)
  const [open, setOpen] = useState(stepsOpen || policy === null)
  return (
    <>
      <ForgeCard rules={rules} cli={cli} onChange={onChange} />
      <Card title="Delivery" actions={<AddStep full={steps.full} onAdd={() => steps.edit(null)} />}>
        <div className={FORM}>
          <PolicyChooser
            value={policy}
            custom
            onChange={(next) => onChange({ steps: stepsOf(next) })}
          />
          <Disclosure
            open={open}
            onOpenChange={setOpen}
            summary={
              <span className={SUMMARY}>
                Steps
                <span className={MARK} aria-hidden="true">
                  {rules.steps.map((step) => {
                    const Icon = STEP_ICONS[step.kind]
                    return <Icon key={step.id} size="sm" />
                  })}
                </span>
              </span>
            }
          >
            <div className="pt-2">
              <StepList rules={rules} onChange={onChange} onEdit={steps.edit} />
            </div>
          </Disclosure>
        </div>
        {steps.dialog}
      </Card>
    </>
  )
}
