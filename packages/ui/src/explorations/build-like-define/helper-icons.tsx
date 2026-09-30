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
 * The icons of the helper agents (issue #77): one icon of the catalogue that says what the helper
 * is for — the robot for a free helper, the flask, the shield, the book, the pencil — and one sign
 * that says it is a helper. The icon in Hemera's tile read at 40 px and not at a chip's 16 px, so
 * the sign is tried three ways, each at 16, 20 and 40 px (story `HelperIcons`):
 *
 * - `plain` · the icon alone at its full size on a chip; the tile only once there is room, at 40;
 * - `tint` · the icon at its full size on a tinted square, one tint a role;
 * - `mark` · the icon at its full size, and Hemera's tile as a small mark on its corner, the same
 *   for every helper: what tells a helper's chip from a run's, whose icons come from the same
 *   catalogue (a test run is a flask too). Recommended, and what the chips and the glance draw.
 *
 * A new defined helper needs no drawing: it picks one icon of the catalogue.
 */

export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

export type HelperIconLook = 'plain' | 'tint' | 'mark'

export const HELPER_GLYPHS: Record<HelperIconName, FunctionComponent<IconProps>> = {
  free: IconRobot,
  reviewer: IconFlask,
  security: IconShield,
  documenter: IconBook,
  prototyper: IconPencil,
}

/** 16 px on a chip, 20 px in a head, 40 px on its own. */
export type HelperIconSize = 'sm' | 'md' | 'xl'

const BOX: Record<HelperIconSize, string> = {
  sm: 'relative inline-flex size-icon-sm shrink-0 items-center justify-center',
  md: 'relative inline-flex size-5 shrink-0 items-center justify-center',
  xl: 'relative inline-flex size-10 shrink-0 items-center justify-center',
}

/** The catalogue's step the icon is drawn at, filling its box. */
const STEP: Record<HelperIconSize, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', xl: 'lg' }

/** The tinted square of `tint`, one tint a role, as the notices' kinds wear theirs. */
const TINTS: Record<HelperIconName, string> = {
  free: 'absolute inset-0 rounded-sm bg-muted',
  reviewer: 'absolute inset-0 rounded-sm bg-info-muted',
  security: 'absolute inset-0 rounded-sm bg-primary-muted',
  documenter: 'absolute inset-0 rounded-sm bg-success-muted',
  prototyper: 'absolute inset-0 rounded-sm bg-warning-muted',
}

const TINT_XL: Record<HelperIconName, string> = {
  free: 'absolute inset-0 rounded-lg bg-muted',
  reviewer: 'absolute inset-0 rounded-lg bg-info-muted',
  security: 'absolute inset-0 rounded-lg bg-primary-muted',
  documenter: 'absolute inset-0 rounded-lg bg-success-muted',
  prototyper: 'absolute inset-0 rounded-lg bg-warning-muted',
}

/** The icon's colour on its tint, the tint's own foreground. */
const ON_TINT: Record<HelperIconName, string> = {
  free: 'relative flex text-foreground',
  reviewer: 'relative flex text-info-muted-foreground',
  security: 'relative flex text-primary-muted-foreground',
  documenter: 'relative flex text-success-muted-foreground',
  prototyper: 'relative flex text-warning-muted-foreground',
}

/** Hemera's tile as a small mark on the icon's lower corner, cut out of what is behind it. */
const MARK: Record<HelperIconSize, string> = {
  sm: 'absolute -right-0.5 -bottom-0.5 size-1.5 rounded-sm bg-primary ring-1 ring-card',
  md: 'absolute -right-0.5 -bottom-0.5 size-2 rounded-sm bg-primary ring-1 ring-card',
  xl: 'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-sm bg-primary ring-2 ring-card',
}

/** The brand's tile, as an outline, for `plain` at 40 px. */
const TILE = 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1 -5 5h-8a5 5 0 0 1 -5 -5v-8a5 5 0 0 1 5 -5z'

export interface TiledIconProps {
  /** The catalogue's icon. */
  glyph: FunctionComponent<IconProps>
  /** Which role's tint it takes, for `tint`. */
  role?: HelperIconName | undefined
  look?: HelperIconLook | undefined
  size?: HelperIconSize | undefined
}

/** Any icon of the catalogue as a helper's icon: how every helper's icon is made. */
export function TiledIcon({
  glyph: Glyph,
  role = 'free',
  look = 'mark',
  size = 'sm',
}: TiledIconProps): ReactNode {
  if (look === 'plain' && size === 'xl') {
    return (
      <span aria-hidden="true" className={BOX[size]}>
        <svg
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute inset-0 size-full stroke-current"
        >
          <path d={TILE} />
        </svg>
        <Glyph size="md" aria-hidden="true" />
      </span>
    )
  }
  if (look === 'tint') {
    return (
      <span aria-hidden="true" className={BOX[size]}>
        <span className={size === 'xl' ? TINT_XL[role] : TINTS[role]} />
        <span className={ON_TINT[role]}>
          <Glyph size={size === 'xl' ? 'lg' : 'sm'} aria-hidden="true" />
        </span>
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={BOX[size]}>
      <Glyph size={STEP[size]} aria-hidden="true" />
      {look === 'mark' && <span className={MARK[size]} />}
    </span>
  )
}

export interface HelperIconProps {
  name: HelperIconName
  look?: HelperIconLook | undefined
  size?: HelperIconSize | undefined
}

/** A helper agent's icon, in the colour of the text around it. */
export function HelperIcon({ name, look = 'mark', size = 'sm' }: HelperIconProps): ReactNode {
  return <TiledIcon glyph={HELPER_GLYPHS[name]} role={name} look={look} size={size} />
}
