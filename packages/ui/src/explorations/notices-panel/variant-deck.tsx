import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { IconChevronLeft, IconChevronRight } from '../../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import type { Kind, Waiting } from './fixtures.ts'
import {
  AbovePill,
  Answers,
  Choices,
  headOf,
  KINDS,
  KindMark,
  ORDER,
  type Panel,
  TypeMark,
  Whole,
} from './parts.tsx'

/**
 * B · One at a time. The pill's counts become tabs, a kind each; under them one item, large, with
 * its whole line and its answers, and "1 of 5" with previous and next. Answering one shows the
 * next; the tabs follow it to its kind.
 */

const TAB =
  'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-accent focus-ring aria-selected:bg-accent aria-selected:text-foreground'

function Shown({ item, onAnswer }: { item: Waiting; onAnswer: () => void }): ReactNode {
  const fading = useTransition(crossfade)
  return (
    <motion.div
      key={item.id}
      className="flex flex-col gap-3"
      initial={CROSSFADE.from}
      animate={CROSSFADE.to}
      transition={fading}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <KindMark kind={item.kind} />
        <TypeMark item={item} />
        {item.kind === 'permission' ? (
          <span className="text-muted-foreground">{KINDS.permission.name}</span>
        ) : (
          <span className="min-w-0">{headOf(item)}</span>
        )}
      </div>
      <Whole item={item} />
      <Choices item={item} onAnswer={onAnswer} />
      <div className="flex justify-end">
        <Answers item={item} onAnswer={onAnswer} />
      </div>
    </motion.div>
  )
}

export const DeckPanel: Panel = ({ waiting, open, onAnswer }) => {
  const ordered = ORDER.flatMap((kind) => waiting.filter((one) => one.kind === kind))
  const [at, setAt] = useState(0)
  const index = Math.min(at, ordered.length - 1)
  const item = ordered[index]
  const kinds = ORDER.filter((kind) => ordered.some((one) => one.kind === kind))
  const go = (kind: Kind): void => setAt(ordered.findIndex((one) => one.kind === kind))
  return (
    <AbovePill open={open}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <div role="tablist" aria-label="Kinds" className="flex items-center gap-1">
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={item?.kind === kind}
                className={TAB}
                onClick={() => go(kind)}
              >
                {KINDS[kind].icon}
                <span className="font-mono">
                  {String(ordered.filter((one) => one.kind === kind).length)}
                </span>
              </button>
            ))}
          </div>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {`${String(index + 1)} of ${String(ordered.length)}`}
          </span>
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronLeft size="sm" />}
            aria-label="Previous"
            disabled={index === 0}
            onClick={() => setAt(index - 1)}
          />
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronRight size="sm" />}
            aria-label="Next"
            disabled={index === ordered.length - 1}
            onClick={() => setAt(index + 1)}
          />
        </div>
        <AnimatePresence initial={false} mode="wait">
          {item !== undefined && (
            <Shown key={item.id} item={item} onAnswer={() => onAnswer(item.id)} />
          )}
        </AnimatePresence>
      </div>
    </AbovePill>
  )
}
