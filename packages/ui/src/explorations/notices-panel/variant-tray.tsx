import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { IconChevronDown } from '../../icons.ts'
import type { Waiting } from './fixtures.ts'
import {
  Answers,
  Choices,
  Grow,
  headOf,
  KINDS,
  KindMark,
  ORDER,
  type Panel,
  TypeMark,
  Whole,
} from './parts.tsx'

/**
 * C · Tray. Not a popover: a drawer on the composer's top edge, the composer's whole width, over
 * the thread's end rather than pushing it. It grows up from the edge by its height. A light head
 * a kind, and under it one row an item with its two answers; the line opens in place.
 */

function Row({ item, onAnswer }: { item: Waiting; onAnswer: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const mono = item.kind === 'permission'
  return (
    <div className="flex flex-col py-1">
      <div className="flex min-w-0 items-center gap-2">
        <TypeMark item={item} />
        <button
          type="button"
          aria-expanded={open}
          className={
            mono
              ? 'min-w-0 flex-1 truncate rounded-sm text-left font-mono text-xs outline-none focus-ring'
              : 'min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-ring'
          }
          onClick={() => setOpen(!open)}
        >
          {headOf(item)}
        </button>
        <Answers item={item} onAnswer={onAnswer} />
      </div>
      <AnimatePresence initial={false}>
        {(open || item.kind === 'question') && (
          <Grow key="whole">
            <div className="pt-2">
              <Whole item={item} />
              <Choices item={item} onAnswer={onAnswer} />
            </div>
          </Grow>
        )}
      </AnimatePresence>
    </div>
  )
}

export const TrayPanel: Panel = ({ waiting, open, onClose, onAnswer }) => (
  <div className="absolute inset-x-0 bottom-0">
    <AnimatePresence initial={false}>
      {open && (
        <Grow key="tray">
          <div className="relative flex max-h-pinned flex-col overflow-y-auto rounded-t-xl border border-b-0 border-border bg-card px-4 pt-2 pb-3 shadow-lg">
            <div className="absolute top-2 right-2">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronDown size="sm" />}
                aria-label="Put the tray away"
                onClick={onClose}
              />
            </div>
            {ORDER.map((kind) => {
              const items = waiting.filter((one) => one.kind === kind)
              if (items.length === 0) return null
              return (
                <section key={kind} aria-label={KINDS[kind].name} className="flex flex-col pb-2">
                  <header className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground">
                    <KindMark kind={kind} />
                    {`${KINDS[kind].name} · ${String(items.length)}`}
                  </header>
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <Grow key={item.id}>
                        <Row item={item} onAnswer={() => onAnswer(item.id)} />
                      </Grow>
                    ))}
                  </AnimatePresence>
                </section>
              )
            })}
          </div>
        </Grow>
      )}
    </AnimatePresence>
  </div>
)
