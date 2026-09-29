import { Button } from '@hemera/ui'
import type { ReactNode } from 'react'

/** A group of settings under a heading, down the side of the lab. */
export function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

export interface RangeProps {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly onChange: (value: number) => void
  /** How the value is written beside its label. */
  readonly format?: ((value: number) => string) | undefined
}

/** A number on a track, its value written beside its name. */
export function Range({ label, value, min, max, step, onChange, format }: RangeProps): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{format === undefined ? String(value) : format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}

export interface ChoiceProps<Value extends string | number> {
  readonly label: string
  readonly options: readonly Value[]
  readonly value: Value
  readonly onChange: (value: Value) => void
  readonly name?: ((value: Value) => string) | undefined
}

/** One of a few, as a row of buttons: the chosen one filled. */
export function Choice<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  name,
}: ChoiceProps<Value>): ReactNode {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === value ? 'primary' : 'secondary'}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {name === undefined ? String(option) : name(option)}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** A number written short: two decimals, and a sign when it matters. */
export function signed(value: number): string {
  return `${value >= 0 ? ' ' : ''}${value.toFixed(2)}`
}

/** Seconds as milliseconds, which is how the face's beats read. */
export function ms(seconds: number): string {
  return `${String(Math.round(seconds * 1000))} ms`
}
