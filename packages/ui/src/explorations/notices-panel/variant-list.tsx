import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { IconChevronDown } from '../../icons.ts'
import type { Waiting } from './fixtures.ts'
import {
  AbovePill,
  Answers,
  Choices,
  Grow,
  headOf,
  KindMark,
  ORDER,
  type Panel,
  TypeMark,
  Whole,
} from './parts.tsx'

/**
 * A · Compact list. One dense row an item, sorted by kind: the kind's tinted mark, what it is
 * about cut to one line, and the two answers inline. A row opens in place, by its height, on the
 * whole line and where it runs; a question opens on its choices.
 */

function Row({ item, onAnswer }: { item: Waiting; onAnswer: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const mono = item.kind === 'permission'
  return (
    <div className="flex flex-col border-b border-border py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <KindMark kind={item.kind} />
        <TypeMark item={item} />
        <span
          className={
            mono ? 'min-w-0 flex-1 truncate font-mono text-xs' : 'min-w-0 flex-1 truncate text-sm'
          }
        >
          {headOf(item)}
        </span>
        {item.kind !== 'question' && <Answers item={item} onAnswer={onAnswer} />}
        <IconButton
          variant="ghost"
          size="sm"
          icon={<IconChevronDown size="sm" />}
          aria-label={open ? 'Fold' : 'Unfold'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      </div>
      <AnimatePresence initial={false}>
        {(open || item.kind === 'question') && (
          <Grow key="whole">
            <div className="pt-2 pl-10">
              <Whole item={item} />
              <Choices item={item} onAnswer={onAnswer} />
            </div>
          </Grow>
        )}
      </AnimatePresence>
    </div>
  )
}

export const ListPanel: Panel = ({ waiting, open, onAnswer }) => (
  <AbovePill open={open}>
    <div role="group" aria-label="Waiting for your answer" className="flex flex-col">
      <AnimatePresence initial={false}>
        {ORDER.flatMap((kind) => waiting.filter((one) => one.kind === kind)).map((item) => (
          <Grow key={item.id}>
            <Row item={item} onAnswer={() => onAnswer(item.id)} />
          </Grow>
        ))}
      </AnimatePresence>
    </div>
  </AbovePill>
)
