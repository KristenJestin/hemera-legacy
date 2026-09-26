import { expect } from 'storybook/test'

import { movesLess } from './reduced-motion.ts'

/**
 * Watches a list's mark through a move, a frame at a time, and says on which frames an item
 * other than the chosen one was drawn over it (issue #127).
 *
 * Asked of the browser's own hit test, because paint order is the only thing that can answer
 * it: `document.elementsFromPoint` at the mark's centre lists what is drawn there from the top
 * down, and the mark has to come before every sibling item — the item itself, its background.
 * What an item says is drawn over the mark on purpose and is not a sibling item: the mark
 * stands above the items' backgrounds and below their content.
 *
 * The mark takes no pointer, which is also what takes it out of a hit test; for the length of
 * the watch its shape is given one back, and nothing else is.
 *
 * It lives here rather than in a story file because every list that has a mark plays it: the
 * tabs, the chrome bar's Projects, the sidebar, the settings and the Project settings.
 */
export interface MarkWatch {
  /** How many frames were looked at. */
  frames: number
  /** How many different places the mark was seen at: one is a mark that never travelled. */
  places: number
  /** The frames where a sibling item was drawn over the mark, said as `<item> over the mark`. */
  buried: string[]
}

/** The mark's own attribute, and its shape's: what the watch looks for in the list. */
const MARK = '[data-sliding-mark]'
const SHAPE = '[data-mark-shape]'

/** How many frames in a row the mark has to stay put for its journey to be over. */
const STILL_FRAMES = 12

/** How long a journey may take before the watch gives up on it, in milliseconds. */
const LONGEST = 3000

export async function watchMark(list: Element, move: () => Promise<void>): Promise<MarkWatch> {
  const style = document.createElement('style')
  style.textContent = `${SHAPE} { pointer-events: auto !important; }`
  document.head.append(style)
  const buried: string[] = []
  const seen = new Set<string>()
  let frames = 0
  let still = 0
  let last = ''
  let moving = true

  const look = (): void => {
    const mark = list.querySelector<HTMLElement>(MARK)
    const shape = mark?.querySelector<HTMLElement>(SHAPE)
    if (mark === null || mark === undefined || shape === null || shape === undefined) return
    const point = centreOf(mark, shape)
    const at = `${point.x.toFixed(1)},${point.y.toFixed(1)}`
    seen.add(at)
    still = at === last ? still + 1 : 0
    last = at
    frames += 1
    const target = mark.dataset['slidingMark']
    const siblings = [...list.querySelectorAll<HTMLElement>('[data-mark]')].filter(
      (item) => item.dataset['mark'] !== target,
    )
    const stack = document.elementsFromPoint(point.x, point.y)
    const markAt = stack.findIndex((element) => shape.contains(element))
    const siblingAt = stack.findIndex((element) => siblings.some((item) => item === element))
    if (siblingAt !== -1 && (markAt === -1 || siblingAt < markAt)) {
      const over = siblings.find((item) => item === stack[siblingAt])
      buried.push(`${over?.dataset['mark'] ?? '?'} over the mark at frame ${String(frames)}`)
    }
  }

  const watching = new Promise<void>((done) => {
    const started = performance.now()
    const frame = (): void => {
      look()
      const settled = !moving && still >= STILL_FRAMES
      if (settled || performance.now() - started > LONGEST) {
        done()
        return
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })

  try {
    await move()
    moving = false
    await watching
  } finally {
    style.remove()
  }
  return { frames, places: seen.size, buried }
}

/** A point of the screen, in the pixels `elementsFromPoint` takes. */
interface Point {
  x: number
  y: number
}

/**
 * Watches the mark out to one item and back to another: the way down and the way up, the way
 * out and the way home. Two journeys, one after the other, because the second starts where the
 * first one landed.
 */
export async function watchThereAndBack(
  list: Element,
  there: () => Promise<void>,
  back: () => Promise<void>,
): Promise<MarkWatch[]> {
  const out = await watchMark(list, there)
  const home = await watchMark(list, back)
  return [out, home]
}

/**
 * What every play of a mark asserts: no frame of any journey had a sibling item over the mark,
 * and each journey was one — a mark seen at two places only never travelled, unless the page is
 * asking for less movement, where jumping is the rule.
 */
export function expectNeverBuried(watches: MarkWatch[]): void {
  for (const watched of watches) {
    expect(watched.buried).toEqual([])
    if (!movesLess()) expect(watched.places).toBeGreaterThan(2)
  }
}

/**
 * Where the mark's centre is on screen. A reaching mark is a sheet the width of the list cut
 * down by two edges, and its centre is the middle of what the cut leaves, not of the sheet.
 */
function centreOf(mark: HTMLElement, shape: HTMLElement): Point {
  const box = shape.getBoundingClientRect()
  const left = Number.parseFloat(mark.style.getPropertyValue('--mark-left'))
  const right = Number.parseFloat(mark.style.getPropertyValue('--mark-right'))
  const y = box.top + box.height / 2
  if (Number.isNaN(left) || Number.isNaN(right)) return { x: box.left + box.width / 2, y }
  return { x: box.left + (left + box.width - right) / 2, y }
}
