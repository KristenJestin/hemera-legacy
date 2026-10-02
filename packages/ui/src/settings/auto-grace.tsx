import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { OVER_MARK, SlidingMark } from '../components/sliding-mark/sliding-mark.tsx'

/** The seconds a call that needs an answer may wait for it, from none to the longest (#304). */
const GRACES: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 s' },
  { value: 10, label: '10 s' },
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
]

/* Drawn as the strictness segment is: one fill that travels (#127). */
const SEGMENT =
  'relative isolate inline-flex items-center gap-1 self-start rounded-lg border border-border bg-muted p-1'
const CHOICE =
  'relative inline-flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground'
const CHOICE_ON = 'z-1 text-foreground'
const CHOICE_MARK = 'absolute inset-0 rounded-md bg-card shadow-sm'

export interface GraceChoiceProps {
  /** In seconds. */
  grace: number
  onGraceChange: (grace: number) => void
  disabled?: boolean | undefined
}

/**
 * How long a call of Hemera's tools that needs the reader's answer waits for it, while the window
 * is focused, before the agent goes on without it (#304). A setting of Hemera Auto's own, as the
 * strictness is.
 */
export function GraceChoice({
  grace,
  onGraceChange,
  disabled = false,
}: GraceChoiceProps): ReactNode {
  // A value no choice names is shown as the nearest one below it.
  const shown =
    [...GRACES].reverse().find((choice) => choice.value <= grace)?.value ?? GRACES[0]?.value ?? 0
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Approval grace</p>
      <RadioGroup
        className={SEGMENT}
        aria-label="Approval grace"
        value={String(shown)}
        disabled={disabled}
        onValueChange={(next) => {
          const chosen = GRACES.find((choice) => String(choice.value) === next)
          if (chosen !== undefined) onGraceChange(chosen.value)
        }}
      >
        {GRACES.map((choice) => (
          <Radio.Root
            key={choice.value}
            value={String(choice.value)}
            data-mark={String(choice.value)}
            nativeButton
            render={<button type="button" />}
            className={cn(CHOICE, choice.value === shown && CHOICE_ON)}
          >
            <span className={OVER_MARK}>{choice.label}</span>
          </Radio.Root>
        ))}
        {/* Last, so that it is drawn after every choice it can cross. */}
        <SlidingMark target={String(shown)} shape={CHOICE_MARK} />
      </RadioGroup>
    </div>
  )
}
