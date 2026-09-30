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
 * The icons of the helper agents (the maintainer's choice of 30 September on issue #77): Hemera's
 * rounded tile, and inside it one icon of the catalogue that says what the helper is for.
 *
 * The tile is what makes it a helper — the same outline for every one of them — and the icon is
 * what it does. A new defined helper needs no drawing: it picks one icon of the catalogue, and the
 * tile makes it one of the family.
 *
 * - free helper · the robot, a helper with no role written in advance;
 * - Test review · the flask;
 * - Security review · the shield;
 * - Documenter · the book;
 * - Prototyper · the pencil, a sketch.
 */

export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

export const HELPER_GLYPHS: Record<HelperIconName, FunctionComponent<IconProps>> = {
  free: IconRobot,
  reviewer: IconFlask,
  security: IconShield,
  documenter: IconBook,
  prototyper: IconPencil,
}

export type HelperIconSize = 'sm' | 'md' | 'xl'

/** The tile's box at each size. */
const BOX: Record<HelperIconSize, string> = {
  sm: 'relative inline-flex size-icon-sm shrink-0 items-center justify-center',
  md: 'relative inline-flex size-icon-md shrink-0 items-center justify-center',
  xl: 'relative inline-flex size-10 shrink-0 items-center justify-center',
}

/**
 * The icon inside the tile, a little over half of it, so the two read apart at a chip's size: the
 * catalogue's smallest step, drawn smaller still, since the catalogue has no step that small.
 */
const INSIDE: Record<HelperIconSize, string> = {
  sm: 'flex scale-60',
  md: 'flex scale-60',
  xl: 'flex',
}

/** The catalogue's step the icon is drawn at before it is scaled. */
const STEP: Record<HelperIconSize, 'sm' | 'lg'> = { sm: 'sm', md: 'sm', xl: 'lg' }

/** The brand's tile, as an outline. */
const TILE = 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1 -5 5h-8a5 5 0 0 1 -5 -5v-8a5 5 0 0 1 5 -5z'

export interface TiledIconProps {
  /** The catalogue's icon the tile holds. */
  glyph: FunctionComponent<IconProps>
  size?: HelperIconSize | undefined
}

/** Any icon of the catalogue in the helper's tile: how every helper's icon is made. */
export function TiledIcon({ glyph: Glyph, size = 'sm' }: TiledIconProps): ReactNode {
  return (
    <span aria-hidden="true" className={BOX[size]}>
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute inset-0 size-full stroke-current"
      >
        <path d={TILE} />
      </svg>
      <span className={INSIDE[size]}>
        <Glyph size={STEP[size]} aria-hidden="true" />
      </span>
    </span>
  )
}

export interface HelperIconProps {
  name: HelperIconName
  size?: HelperIconSize | undefined
}

/** A helper agent's icon, in the colour of the text around it. */
export function HelperIcon({ name, size = 'sm' }: HelperIconProps): ReactNode {
  return <TiledIcon glyph={HELPER_GLYPHS[name]} size={size} />
}
