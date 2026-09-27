import { cn } from 'cn'
import type { FunctionComponent, ReactNode } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { Button, IconButton } from '../components/button/button.tsx'
import { Menu } from '../components/menu/menu.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import {
  type IconProps,
  IconChevronRight,
  IconCircleCheck,
  IconCircleX,
  IconHammer,
  IconPencil,
  IconRefresh,
} from '../icons.ts'
import type { RevisionView, SpecStatus, SpecType } from './model.ts'
import { SPEC_TYPE_ICONS } from './spec-icons.ts'

/**
 * The first line of the Spec panel: which Spec, what kind, where it stands (lot 19, brief
 * "Head").
 *
 * The key in mono, because it is what a person types to find it again; the title; the type as
 * a quiet chip; the status as an icon in its colour between the key and the title, and no word
 * (issue #159): the word is its tooltip and its accessible name. A revision is only named once there is more than one, and then as the picker of the
 * revisions, the older ones read only. `Rework` stands at the end of the line of a `ready` Spec
 * and nowhere else: it is the one way back to a draft (core.md, "Spec and revisions"). `Mark
 * ready` is not here: it stands in the panel's footer, where the build's actions take its place
 * once the Spec is ready (issue #150). The very end is the fold, which takes the panel back to its
 * band beside the chat (brief revision 4).
 */

/**
 * As tall as its tallest control, the picker of the revisions or `Rework`, whether they are there
 * or not: the fold chevron at its end stays at one height, the unfold chevron's (issue #181).
 */
const HEAD = 'flex min-h-control-md items-center gap-2.5'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 truncate text-base font-semibold'

/** The status's icon, which the keyboard reaches for its tooltip as the pointer does. */
const STATUS = 'focus-ring flex shrink-0 rounded-sm not-italic'

const END = 'ml-auto flex shrink-0 items-center gap-1.5'

/**
 * The icon of each status (D8-13, issue #159): a draft is being written, a frozen Spec is the
 * success one, a Spec a build has taken on is being built in the running colour, and one taken
 * back is the quiet one. The word is what the tooltip and the accessible name say.
 */
const STATUS_ICON: Record<
  SpecStatus,
  { Icon: FunctionComponent<IconProps>; word: string; tone: string }
> = {
  draft: { Icon: IconPencil, word: 'Draft', tone: 'text-muted-foreground' },
  ready: { Icon: IconCircleCheck, word: 'Ready', tone: 'text-success' },
  in_progress: { Icon: IconHammer, word: 'Building', tone: 'text-warning' },
  cancelled: { Icon: IconCircleX, word: 'Cancelled', tone: 'text-muted-foreground' },
}

export interface SpecHeadProps {
  specKey: string
  title: string
  type: SpecType
  status: SpecStatus
  /** The revision shown. */
  revision: number
  /** Every revision, newest first. */
  revisions: RevisionView[]
  /** Whether the revision shown is an older one, which is read only and cannot be reworked. */
  superseded?: boolean | undefined
  /** Shows another revision; an older one is read only. */
  onPickRevision: (revision: number) => void
  /** Opens the rework of a `ready` Spec. */
  onRework: () => void
  /** Folds the panel to its band; the button is drawn only when this is given. */
  onFold?: (() => void) | undefined
}

export function SpecHead({
  specKey,
  title,
  type,
  status,
  revision,
  revisions,
  superseded = false,
  onPickRevision,
  onRework,
  onFold,
}: SpecHeadProps): ReactNode {
  const ready = status === 'ready'
  const TypeIcon = SPEC_TYPE_ICONS[type]
  const { Icon: StatusIcon, word, tone } = STATUS_ICON[status]
  const reworkable = ready && !superseded
  return (
    <div className={HEAD}>
      <span className={KEY}>{specKey}</span>
      <Tooltip label={word}>
        <i
          role="img"
          // Focusable so the keyboard reaches its tooltip as the pointer does.
          tabIndex={0}
          aria-label={word}
          className={cn(STATUS, tone)}
        >
          <StatusIcon size="sm" aria-hidden="true" />
        </i>
      </Tooltip>
      <h2 className={TITLE}>{title}</h2>
      <Badge icon={<TypeIcon size="sm" aria-hidden="true" />}>{type}</Badge>
      {(revisions.length > 1 || reworkable || onFold !== undefined) && (
        <span className={END}>
          {revisions.length > 1 && (
            <Menu
              // The newest is the Spec as it stands; an older one is said by when it was frozen.
              label={revision === revisions[0]?.number ? 'Latest' : 'Earlier'}
              groups={[
                revisions.map((one) => ({
                  label: one.detail,
                  onSelect: () => onPickRevision(one.number),
                })),
              ]}
            />
          )}
          {reworkable && (
            // The height of the picker beside it, which is a menu's own trigger: two controls of
            // two heights at the end of one line read as two lines.
            <Button onClick={onRework}>
              <IconRefresh size="sm" />
              Rework
            </Button>
          )}
          {onFold !== undefined && (
            <Tooltip label="Fold the Spec">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronRight size="sm" />}
                aria-label="Fold the Spec"
                onClick={onFold}
              />
            </Tooltip>
          )}
        </span>
      )}
    </div>
  )
}
