import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Frame } from '../../components/frame/frame.tsx'
import { Menu } from '../../components/menu/menu.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { AgentModelMenu } from '../../composer/agent-model-menu.tsx'
import { AGENTS, offerOf } from '../../composer/agent-model-menu-fixtures.tsx'
import { ComposerBox, type ComposerBoxHandle } from '../../composer/composer-box.tsx'
import { PromptInput } from '../../composer/prompt-input.tsx'
import {
  IconArchive,
  IconArrowUp,
  IconAt,
  IconDots,
  IconInfoCircle,
  IconPaperclip,
  IconPencil,
  IconPlayerStop,
} from '../../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'

/**
 * The Session's head and composer as issue #241 is making them, drawn here so the variants are
 * judged in the page they will live in: no title; the line, the ⓘ and the ⋯ on one row at the top;
 * and a composer whose only row is its own, the send an icon at its end. Stand-ins built from the
 * design system's own pieces until #241 lands; the Home's composer is not concerned.
 */

const HEAD = 'flex min-w-0 items-start gap-2'

const TOOLS = 'flex shrink-0 items-center gap-1'

/** The head: the line — chips and Run — then the ⓘ and the ⋯, on one row. */
export function SessionHead({
  line,
  onOpenDetails,
}: {
  line: ReactNode
  onOpenDetails: () => void
}): ReactNode {
  return (
    <div className={HEAD}>
      {line}
      <span className={TOOLS}>
        <Tooltip label="Session details">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconInfoCircle size="sm" />}
            aria-label="Session details"
            onClick={onOpenDetails}
          />
        </Tooltip>
        <Menu
          label="Rename or archive this Session"
          icon={<IconDots size="sm" />}
          groups={[
            [
              { label: 'Rename', icon: <IconPencil size="sm" /> },
              { label: 'Archive', icon: <IconArchive size="sm" /> },
            ],
          ]}
        />
      </span>
    </div>
  )
}

/** The agent's one control, as the page holds it. */
function AgentMenu(): ReactNode {
  const [model, setModel] = useState<string | null>('sonnet-4-5')
  const [effort, setEffort] = useState<string | null>(null)
  const [mode, setMode] = useState<string | null>('ask-before-edits')
  const offer = offerOf('claude-code', model)
  return (
    <AgentModelMenu
      fixed
      agents={AGENTS}
      agent="claude-code"
      onAgentChange={() => undefined}
      models={offer.models}
      model={model}
      onModelChange={setModel}
      efforts={offer.efforts}
      effort={effort}
      onEffortChange={setEffort}
      modes={offer.modes}
      mode={mode}
      onModeChange={setMode}
    />
  )
}

/**
 * The composer of a Session: the box, and one row under it — the `@`, the clip, the agent's menu
 * and, at its end, Send as an arrow. Stop takes the arrow's place and shape during a turn.
 */
export function SessionComposer({ running }: { running: boolean }): ReactNode {
  const [value, setValue] = useState('')
  const box = useRef<ComposerBoxHandle>(null)
  const fading = useTransition(crossfade)
  const ready = value.trim() !== ''
  return (
    <Frame animated focusable>
      <PromptInput
        variant="inline"
        ready={ready && !running}
        onSend={() => setValue('')}
        tools={
          <>
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconAt size="sm" />}
              aria-label="Mention a file of the Project"
            />
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconPaperclip size="sm" />}
              aria-label="Attach a file"
            />
            <span className="ml-auto flex min-w-0 items-center gap-1">
              <AgentMenu />
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={running ? 'stop' : 'send'}
                  className="flex"
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                >
                  {running ? (
                    <IconButton
                      variant="secondary"
                      size="sm"
                      icon={<IconPlayerStop size="sm" />}
                      aria-label="Stop"
                    />
                  ) : (
                    <IconButton
                      variant="primary"
                      size="sm"
                      icon={<IconArrowUp size="sm" />}
                      aria-label="Send"
                      disabled={!ready}
                      onClick={() => setValue('')}
                    />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
          </>
        }
      >
        <ComposerBox
          handle={box}
          value={value}
          placeholder="Say something to claude-code…"
          onValueChange={setValue}
          onKeyDown={() => undefined}
        />
      </PromptInput>
    </Frame>
  )
}
