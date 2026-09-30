import type { FunctionComponent, ReactNode } from 'react'

import {
  IconBook,
  IconFlask,
  IconPencil,
  type IconProps,
  IconRobot,
  IconShield,
} from '../../icons.ts'

/**
 * The icons of the helper agents (issue #77, the maintainer's direction of 30 September): the bot
 * says "a helper", and a second icon of the catalogue says its role — the flask, the shield, the
 * book, the pencil. A free helper is the bot alone. Three ways to put the two together, each at
 * 16, 20 and 40 px (story `HelperIcons`):
 *
 * - `pair` · the bot and the role side by side, both at full size: nothing is shrunk, so both
 *   read at 16 px. Recommended, and what the chips, the glance and the dialog draw.
 * - `badge` · the bot at full size, the role on a small disc over its lower corner;
 * - `role` · the role at full size, the bot on the small disc instead.
 *
 * A new defined helper needs no drawing: it picks one icon of the catalogue for its role.
 */

export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

export type HelperIconLook = 'pair' | 'badge' | 'role'

/** The role's icon; a free helper has none. */
export const HELPER_ROLES: Record<HelperIconName, FunctionComponent<IconProps> | null> = {
  free: null,
  reviewer: IconFlask,
  security: IconShield,
  documenter: IconBook,
  prototyper: IconPencil,
}

/** 16 px on a chip, 20 px in a head, 40 px on its own. */
export type HelperIconSize = 'sm' | 'md' | 'xl'

/** The catalogue's step each icon is drawn at. */
const STEP: Record<HelperIconSize, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', xl: 'lg' }

const BOX: Record<HelperIconSize, string> = {
  sm: 'relative inline-flex size-icon-sm shrink-0 items-center justify-center',
  md: 'relative inline-flex size-5 shrink-0 items-center justify-center',
  xl: 'relative inline-flex size-10 shrink-0 items-center justify-center',
}

const PAIR: Record<HelperIconSize, string> = {
  sm: 'inline-flex shrink-0 items-center gap-0',
  md: 'inline-flex shrink-0 items-center gap-0.5',
  xl: 'inline-flex shrink-0 items-center gap-1',
}

/** The small disc over the lower corner, cut out of what is behind it. */
const DISC: Record<HelperIconSize, string> = {
  sm: 'absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full bg-card ring-1 ring-card',
  md: 'absolute -right-1 -bottom-1 flex size-3 items-center justify-center rounded-full bg-card ring-1 ring-card',
  xl: 'absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card',
}

/** The icon on the disc, drawn at the catalogue's smallest step and scaled down to it. */
const ON_DISC: Record<HelperIconSize, string> = {
  sm: 'flex scale-50',
  md: 'flex scale-60',
  xl: 'flex scale-90',
}

export interface HelperGlyphsProps {
  /** The role's icon, or none for a free helper. */
  role: FunctionComponent<IconProps> | null
  look?: HelperIconLook | undefined
  size?: HelperIconSize | undefined
}

/** The bot and a role's icon put together: how every helper's icon is made. */
export function HelperGlyphs({
  role: Role,
  look = 'pair',
  size = 'sm',
}: HelperGlyphsProps): ReactNode {
  const step = STEP[size]
  if (Role === null) {
    return (
      <span aria-hidden="true" className={BOX[size]}>
        <IconRobot size={step} aria-hidden="true" />
      </span>
    )
  }
  if (look === 'pair') {
    return (
      <span aria-hidden="true" className={PAIR[size]}>
        <IconRobot size={step} aria-hidden="true" />
        <Role size={step} aria-hidden="true" />
      </span>
    )
  }
  const Big = look === 'badge' ? IconRobot : Role
  const Small = look === 'badge' ? Role : IconRobot
  return (
    <span aria-hidden="true" className={BOX[size]}>
      <Big size={step} aria-hidden="true" />
      <span className={DISC[size]}>
        <span className={ON_DISC[size]}>
          <Small size="sm" aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

export interface HelperIconProps {
  name: HelperIconName
  look?: HelperIconLook | undefined
  size?: HelperIconSize | undefined
}

/** A helper agent's icon, in the colour of the text around it. */
export function HelperIcon({ name, look = 'pair', size = 'sm' }: HelperIconProps): ReactNode {
  return <HelperGlyphs role={HELPER_ROLES[name]} look={look} size={size} />
}
