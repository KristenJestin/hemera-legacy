import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
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
 * D · Inbox. Two columns in one panel, as a mail client: on the left every item in one short row
 * — its kind's tinted mark and what it is about — and on the right the one chosen, whole, with its
 * answers. Nothing opens or folds inside the list; answering one chooses the next.
 */

const ROW =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring aria-selected:bg-accent'

export const SplitPanel: Panel = ({ waiting, open, onAnswer }) => {
  const ordered = ORDER.flatMap((kind) => waiting.filter((one) => one.kind === kind))
  const [chosen, setChosen] = useState<string | null>(null)
  const item = ordered.find((one) => one.id === chosen) ?? ordered[0]
  const fading = useTransition(crossfade)
  return (
    <AbovePill open={open}>
      <div className="grid grid-cols-5 gap-3">
        <div
          role="listbox"
          aria-label="Waiting for your answer"
          className="col-span-2 flex flex-col gap-0.5"
        >
          {ordered.map((one) => (
            <button
              key={one.id}
              type="button"
              role="option"
              aria-selected={one.id === item?.id}
              className={ROW}
              onClick={() => setChosen(one.id)}
            >
              <KindMark kind={one.kind} />
              <span
                className={
                  one.kind === 'permission'
                    ? 'min-w-0 truncate font-mono text-xs'
                    : 'min-w-0 truncate'
                }
              >
                {headOf(one)}
              </span>
            </button>
          ))}
        </div>
        <div className="col-span-3 flex min-w-0 flex-col border-l border-border pl-3">
          <AnimatePresence initial={false} mode="wait">
            {item !== undefined && (
              <motion.div
                key={item.id}
                className="flex flex-col gap-3"
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                transition={fading}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <TypeMark item={item} />
                  <span className="min-w-0">
                    {item.kind === 'permission' ? KINDS.permission.name : headOf(item)}
                  </span>
                </div>
                <Whole item={item} />
                <Choices item={item} onAnswer={() => onAnswer(item.id)} />
                <div className="flex justify-end">
                  <Answers item={item} onAnswer={() => onAnswer(item.id)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AbovePill>
  )
}
