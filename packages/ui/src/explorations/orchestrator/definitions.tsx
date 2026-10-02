import type { ReactNode } from 'react'

import { IconLock, IconPencil } from '../../icons.ts'
import { DEFINITIONS, type HelperDefinition } from './fixtures.ts'
import { HelperIcon, type HelperIconName } from './helper-icons.tsx'

/**
 * The helpers written in advance, as their definitions say them: one card each, its icon, its name,
 * what it is for, what it receives, what it may do, what it returns and where it is launched — and
 * last the free helper, which has no definition and wears the common icon.
 */

const PAGE = 'mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-8'

const CARD = 'flex gap-4 rounded-lg border border-border bg-card p-4'

const TILE = 'flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground'

const BODY = 'flex min-w-0 flex-1 flex-col gap-2'

const NAME_LINE = 'flex min-w-0 items-center gap-2'

const NAME = 'text-base font-medium'

const WHERE = 'font-mono text-xs text-muted-foreground'

const DESCRIPTION = 'text-sm text-muted-foreground'

const FACTS = 'grid grid-cols-3 gap-3 text-xs'

const TERM = 'text-muted-foreground'

/** The four icons side by side at the sizes they are used at. */
const SIZES = 'flex items-center gap-6 rounded-lg border border-border bg-card p-4 text-foreground'

function Card({
  icon,
  name,
  where,
  description,
  facts,
  writes,
}: {
  icon: HelperIconName
  name: string
  where: string
  description: string
  facts: readonly (readonly [string, string])[]
  writes: boolean | null
}): ReactNode {
  return (
    <article aria-label={name} className={CARD}>
      <span className={TILE}>
        <HelperIcon name={icon} size="xl" />
      </span>
      <div className={BODY}>
        <div className={NAME_LINE}>
          <h3 className={NAME}>{name}</h3>
          {writes !== null && (
            <span className="flex text-muted-foreground" title={writes ? 'May write' : 'Read only'}>
              {writes ? (
                <IconPencil size="sm" aria-label="May write" />
              ) : (
                <IconLock size="sm" aria-label="Read only" />
              )}
            </span>
          )}
          <span className={WHERE}>{where}</span>
        </div>
        <p className={DESCRIPTION}>{description}</p>
        {facts.length > 0 && (
          <dl className={FACTS}>
            {facts.map(([term, value]) => (
              <div key={term} className="flex flex-col gap-0.5">
                <dt className={TERM}>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  )
}

function factsOf(definition: HelperDefinition): (readonly [string, string])[] {
  return [
    ['Receives', definition.receives],
    ['May', definition.may],
    ['Returns', definition.returns],
  ]
}

export function HelperDefinitions(): ReactNode {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className={PAGE}>
        <section aria-label="The icons at their sizes" className={SIZES}>
          {(['free', 'reviewer', 'documenter', 'prototyper'] as const).map((name) => (
            <span key={name} className="flex items-end gap-3">
              <HelperIcon name={name} size="sm" />
              <HelperIcon name={name} size="md" />
              <HelperIcon name={name} size="lg" />
              <HelperIcon name={name} size="xl" />
            </span>
          ))}
        </section>
        {DEFINITIONS.map((definition) => (
          <Card
            key={definition.id}
            icon={definition.icon}
            name={definition.name}
            where={definition.where}
            description={definition.description}
            facts={factsOf(definition)}
            writes={definition.writes}
          />
        ))}
        <Card
          icon="free"
          name="Free helper"
          where="any protocol"
          description="Launched by the main agent, or by another helper, with a brief it writes itself: no type, no definition."
          facts={[]}
          writes={null}
        />
      </div>
    </div>
  )
}
