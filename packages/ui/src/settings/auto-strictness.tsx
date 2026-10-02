import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { OVER_MARK, SlidingMark } from '../components/sliding-mark/sliding-mark.tsx'
import { IconShield, IconShieldCheck, IconShieldHalf } from '../icons.ts'

/** How often Hemera Auto asks when its engine judged a call, from most to least often (#298). */
export type StrictnessLevel = 'careful' | 'normal' | 'permissive'

const LEVELS: readonly { value: StrictnessLevel; label: string; icon: ReactNode }[] = [
  { value: 'careful', label: 'Careful', icon: <IconShieldCheck size="sm" aria-hidden="true" /> },
  { value: 'normal', label: 'Normal', icon: <IconShieldHalf size="sm" aria-hidden="true" /> },
  { value: 'permissive', label: 'Permissive', icon: <IconShield size="sm" aria-hidden="true" /> },
]

/* Drawn as the Theme segment of Appearance is: three choices, one fill that travels (#127). */
const SEGMENT =
  'relative isolate inline-flex items-center gap-1 self-start rounded-lg border border-border bg-muted p-1'
const CHOICE =
  'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground'
const CHOICE_ON = 'z-1 text-foreground'
const CHOICE_CONTENT = 'inline-flex items-center gap-1.5'
const CHOICE_MARK = 'absolute inset-0 rounded-md bg-card shadow-sm'

export interface StrictnessChoiceProps {
  strictness: StrictnessLevel
  onStrictnessChange: (strictness: StrictnessLevel) => void
  disabled?: boolean | undefined
}

/**
 * The strictness of Hemera Auto, a setting of its own: it sits in Hemera Auto's settings and
 * holds nothing of them, so it moves with a line wherever that section goes.
 */
export function StrictnessChoice({
  strictness,
  onStrictnessChange,
  disabled = false,
}: StrictnessChoiceProps): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Strictness</p>
      <RadioGroup
        className={SEGMENT}
        aria-label="Strictness"
        value={strictness}
        disabled={disabled}
        onValueChange={(next) => {
          const chosen = LEVELS.find((level) => level.value === next)
          if (chosen !== undefined) onStrictnessChange(chosen.value)
        }}
      >
        {LEVELS.map((level) => (
          <Radio.Root
            key={level.value}
            value={level.value}
            data-mark={level.value}
            nativeButton
            render={<button type="button" />}
            className={cn(CHOICE, level.value === strictness && CHOICE_ON)}
          >
            <span className={cn(OVER_MARK, CHOICE_CONTENT)}>
              {level.icon}
              {level.label}
            </span>
          </Radio.Root>
        ))}
        {/* Last, so that it is drawn after every level it can cross. */}
        <SlidingMark target={strictness} shape={CHOICE_MARK} />
      </RadioGroup>
    </div>
  )
}
