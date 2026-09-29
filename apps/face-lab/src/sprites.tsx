import { createContext, useContext, useEffect, useRef } from 'react'

/**
 * Everything the lab draws on a frame: one loop, many faces.
 *
 * A face of the lab is not a `Face`: it is a player and a figure, painted at the lab's own time,
 * so that one clock slows, stops or rewinds all of them at once. Each registers what it paints,
 * and the lab's loop hands every one of them the same time.
 */
export type Sprite = (at: number) => void

export interface Sprites {
  readonly add: (sprite: Sprite) => () => void
}

export const SpritesContext = createContext<Sprites | null>(null)

/** Paints `sprite` on every frame of the lab, whatever it closes over when it is called. */
export function useSprite(sprite: Sprite): void {
  const sprites = useContext(SpritesContext)
  const latest = useRef(sprite)
  latest.current = sprite
  useEffect(() => {
    if (sprites === null) return undefined
    return sprites.add((at) => latest.current(at))
  }, [sprites])
}
