import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconHammer, IconMessages } from '../../icons.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import { Head, MainComposer, Stage, type VariantProps, useBuild, useHelpers } from './page.tsx'
import { MAIN_THREAD } from './threads.tsx'

/**
 * B · Build and Chat. Two full-width views of one Session, and a switch between them at the start
 * of the head's line. The composer is the page's foot, under both, with the notices on its edge:
 * a message to the main agent is always one click in the box, whichever view is up.
 *
 * The view cross-fades in place; the head and the foot never move. The Chat's switch wears a dot
 * while the main agent said something the Build view did not show.
 */

const SWITCH =
  'inline-flex h-control-sm shrink-0 items-center rounded-md border border-border bg-muted'

const OPTION =
  'relative inline-flex h-full items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-ring aria-selected:bg-card aria-selected:text-foreground'

/** The Chat's dot, over its corner: it comes and goes without moving the line. */
const UNREAD = 'absolute top-0.5 right-0.5 flex'

type View = 'build' | 'chat'

function Switch({
  view,
  onView,
  unread,
}: {
  view: View
  onView: (view: View) => void
  unread: boolean
}): ReactNode {
  return (
    <div role="tablist" aria-label="What the page shows" className={SWITCH}>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'build'}
        className={OPTION}
        onClick={() => onView('build')}
      >
        <IconHammer size="sm" aria-hidden="true" />
        Build
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'chat'}
        className={OPTION}
        onClick={() => onView('chat')}
      >
        <IconMessages size="sm" aria-hidden="true" />
        Chat
        {unread && view !== 'chat' && (
          <span className={UNREAD}>
            <StatusDot status="running" size="sm" label="New" />
          </span>
        )}
      </button>
    </div>
  )
}

export function TabsSession(props: VariantProps): ReactNode {
  const { helpers, open, setOpen, helper } = useHelpers(props)
  const { view, notices } = useBuild()
  const [shown, setShown] = useState<View>(props.chatOpen ? 'chat' : 'build')
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const fade = useTransition(crossfade)
  // A helper's session is opened over whichever view is up, and the switch takes the reader back.
  const onView = (next: View): void => {
    setOpen(null)
    setShown(next)
  }
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Head
        helpers={helpers}
        openHelper={open}
        onOpenHelper={setOpen}
        glance={props.glance}
        start={<Switch view={shown} onView={onView} unread />}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence initial={false}>
          <motion.div
            key={shown === 'chat' && helper === undefined ? 'chat' : 'stage'}
            className="absolute inset-0 flex flex-col"
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            exit={CROSSFADE.from}
            transition={fade}
          >
            {shown === 'chat' && helper === undefined ? (
              <MessageScroller
                className="flex-1"
                label="The thread of this Session"
                entries={MAIN_THREAD}
              />
            ) : (
              <Stage view={view} helper={helper} helpers={helpers} onBack={() => setOpen(null)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="border-t border-border pt-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
          <MainComposer
            value={value}
            onValueChange={setValue}
            files={files}
            onFilesChange={setFiles}
            notices={notices}
          />
        </div>
      </div>
    </div>
  )
}
