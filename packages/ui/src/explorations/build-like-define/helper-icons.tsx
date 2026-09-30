import { cn } from 'cn'
import type { FunctionComponent, ReactNode } from 'react'

import {
  IconBulb,
  IconFlask,
  type IconProps,
  IconRobot,
  IconShield,
  IconWriting,
} from '../../icons.ts'

/**
 * The icons of the helper agents (addition of 30 September to issue #77): one for each defined
 * helper, and one common to every free helper.
 *
 * They are Hemera's family: the tile of the brand mark, and the face's own eyes, the chevron that
 * is the prompt's `>` turned down. Each defined helper departs from it by one thing that can be
 * named, the way each expression of the face departs from the chevron:
 *
 * - the free helper · the face, with a second tile behind it: one more of Hemera, nothing else;
 * - the reviewer · its eyes are a pair of glasses: it reads, closely, with a fresh eye;
 * - the documenter · the tile is a page with its corner folded, the eyes on the work, a line under;
 * - the prototyper · the tile is drawn dashed, as a sketch is: nothing of it is final.
 *
 * Drawn on Tabler's grid and stroke (24, 2, round), so they stand beside the catalogue's icons in
 * a chip without looking borrowed. In the design system they would join `icons.ts`.
 */

export type HelperIconName = 'free' | 'reviewer' | 'security' | 'documenter' | 'prototyper'

/**
 * The three sets the exploration puts side by side (story `HelperIcons`):
 *
 * - `face` · the set so far, each helper a departure from Hemera's face;
 * - `sign` · Hemera's tile for every helper, holding one sign that says the role — a tick, a
 *   shield, lines of text, a plus on a dashed tile — and the face's eyes for a free helper;
 * - `glyph` · the catalogue's own icons, one a role, and the robot for a free helper.
 */
export type HelperIconSet = 'face' | 'sign' | 'glyph'

export type HelperIconSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<HelperIconSize, string> = {
  sm: 'size-icon-sm',
  md: 'size-icon-md',
  lg: 'size-icon-lg',
  xl: 'size-10',
}

const SVG = 'shrink-0 stroke-current'

/** The chevron eyes of the face, centred on `y`, `gap` apart around `x`. */
function eyes(x: number, y: number, gap = 3): string {
  const left = x - gap
  const right = x + gap
  return [
    `M${String(left - 1.7)} ${String(y - 0.9)}l1.7 1.7l1.7 -1.7`,
    `M${String(right - 1.7)} ${String(y - 0.9)}l1.7 1.7l1.7 -1.7`,
  ].join('')
}

/** The brand's tile, as an outline. */
const TILE = 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1 -5 5h-8a5 5 0 0 1 -5 -5v-8a5 5 0 0 1 5 -5z'

const DRAWN: Record<HelperIconName, ReactNode> = {
  free: (
    <>
      <path d="M7 5.5v-0.5a3 3 0 0 1 3 -3h9a3 3 0 0 1 3 3v9a3 3 0 0 1 -3 3h-0.5" />
      <path d="M6 7h8a4 4 0 0 1 4 4v7a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4v-7a4 4 0 0 1 4 -4z" />
      <path d={eyes(10, 13.5, 2.6)} />
    </>
  ),
  reviewer: (
    <>
      <path d={TILE} />
      <circle cx="8.8" cy="11.5" r="2.2" />
      <circle cx="15.2" cy="11.5" r="2.2" />
      <path d="M11 11.5h2" />
      <path d="M9.5 16.5h5" />
    </>
  ),
  security: (
    <>
      <path d={TILE} />
      <circle cx="8.8" cy="10.5" r="2.2" />
      <circle cx="15.2" cy="10.5" r="2.2" />
      <path d="M11 10.5h2" />
      <path d="M12 14l2.5 1v1.3c0 1.2 -1 2 -2.5 2.7c-1.5 -0.7 -2.5 -1.5 -2.5 -2.7v-1.3z" />
    </>
  ),
  documenter: (
    <>
      <path d="M14 3h-6a5 5 0 0 0 -5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5 -5v-6z" />
      <path d="M14 3v4a3 3 0 0 0 3 3h4" />
      <path d="M7.5 12.5l1.5 0.6l1.5 -0.6M13.5 12.5l1.5 0.6l1.5 -0.6" />
      <path d="M8 16.5h7" />
    </>
  ),
  prototyper: (
    <>
      <path d={TILE} strokeDasharray="3.2 2.6" />
      <path d={eyes(12, 11.5)} />
      <path d="M10 16.5l2 -1l2 1" />
    </>
  ),
}

/** The `sign` set: the tile, and one sign inside it. */
const SIGNED: Record<HelperIconName, ReactNode> = {
  free: (
    <>
      <path d={TILE} />
      <path d={eyes(12, 12)} />
    </>
  ),
  reviewer: (
    <>
      <path d={TILE} />
      <path d="M8.5 12.5l2.5 2.5l4.5 -5" />
    </>
  ),
  security: (
    <>
      <path d={TILE} />
      <path d="M12 7.5l4 1.5v3c0 2.5 -1.7 4 -4 5c-2.3 -1 -4 -2.5 -4 -5v-3z" />
    </>
  ),
  documenter: (
    <>
      <path d={TILE} />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </>
  ),
  prototyper: (
    <>
      <path d={TILE} strokeDasharray="3.2 2.6" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
}

/** The `glyph` set: the catalogue's icons. */
const GLYPHS: Record<HelperIconName, FunctionComponent<IconProps>> = {
  free: IconRobot,
  reviewer: IconFlask,
  security: IconShield,
  documenter: IconWriting,
  prototyper: IconBulb,
}

export interface HelperIconProps {
  name: HelperIconName
  /** Which set it is drawn from: the face, unless a story compares them. */
  set?: HelperIconSet | undefined
  size?: HelperIconSize | undefined
  /** Where it sits; never how it looks. */
  className?: string | undefined
}

/** A helper agent's icon, in the colour of the text around it. */
export function HelperIcon({
  name,
  set = 'face',
  size = 'sm',
  className,
}: HelperIconProps): ReactNode {
  if (set === 'glyph') {
    const Glyph = GLYPHS[name]
    return <Glyph size={size === 'xl' ? 'lg' : size} aria-hidden="true" className={className} />
  }
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(SVG, SIZES[size], className)}
    >
      {set === 'sign' ? SIGNED[name] : DRAWN[name]}
    </svg>
  )
}
