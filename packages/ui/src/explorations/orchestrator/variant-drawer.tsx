import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Face } from '../../components/face/face.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconMessages, IconX } from '../../icons.ts'
import { CROSSFADE, arrival, crossfade, slide, useTransition } from '../../motion.ts'
import { Head, MainChat, Stage, type VariantProps, useBuild, useHelpers } from './page.tsx'

/**
 * C · Drawer. The build is the page, at its whole width, all the time; the chat is a drawer that
 * slides over it from the left and slides away again. Nothing under it moves or reflows.
 *
 * Closed, the foot of the page holds the main agent's live face — a press opens the drawer with the
 * caret in the box — and the notices beside it. Open, the notices are on the composer's edge, as in
 * every Session.
 */

const ROW = '@container relative flex min-h-0 flex-1 overflow-hidden'

const DRAWER =
  'absolute inset-y-0 left-0 z-20 flex w-build-panel flex-col border-r border-border bg-background shadow-lg'

const DRAWER_HEAD = 'flex shrink-0 items-center justify-end px-2 pt-2'

const FOOT =
  'pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-end justify-center gap-3 px-4'

const OPENER =
  'pointer-events-auto mb-2.5 inline-flex h-control-md items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium shadow-md outline-none hover:bg-accent focus-ring'

const FROM_LEFT = slide('stage', 'backward')

export function DrawerSession(props: VariantProps): ReactNode {
  const { helpers, open, setOpen, helper } = useHelpers(props)
  const { view, notices } = useBuild()
  const [drawer, setDrawer] = useState(props.chatOpen)
  const [focus, setFocus] = useState(false)
  const moving = useTransition(arrival)
  const fade = useTransition(crossfade)
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Head
        helpers={helpers}
        openHelper={open}
        onOpenHelper={setOpen}
        glance={props.glance}
        start={
          <Tooltip label={drawer ? 'Close the chat' : 'Open the chat'}>
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconMessages size="sm" />}
              aria-label={drawer ? 'Close the chat' : 'Open the chat'}
              aria-expanded={drawer}
              onClick={() => setDrawer(!drawer)}
            />
          </Tooltip>
        }
      />
      <div className={ROW}>
        <Stage view={view} helper={helper} helpers={helpers} onBack={() => setOpen(null)} />
        <AnimatePresence initial={false}>
          {!drawer && (
            <motion.div
              key="foot"
              className={FOOT}
              initial={CROSSFADE.from}
              animate={CROSSFADE.to}
              exit={CROSSFADE.from}
              transition={fade}
            >
              <button
                type="button"
                className={OPENER}
                onClick={() => {
                  setFocus(true)
                  setDrawer(true)
                }}
              >
                <Face state="thinking" size="icon" seed={3} label="The main agent, thinking" />
                Main agent
              </button>
              {notices}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {drawer && (
            <motion.section
              key="drawer"
              aria-label="Chat with the main agent"
              className={DRAWER}
              initial={{ x: FROM_LEFT.enter }}
              animate={{ x: 0 }}
              exit={{ x: FROM_LEFT.enter }}
              transition={moving}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setDrawer(false)
              }}
            >
              <div className={DRAWER_HEAD}>
                <Tooltip label="Close the chat">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<IconX size="sm" />}
                    aria-label="Close the chat"
                    onClick={() => setDrawer(false)}
                  />
                </Tooltip>
              </div>
              <MainChat notices={notices} focus={focus} onFocusTaken={() => setFocus(false)} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
