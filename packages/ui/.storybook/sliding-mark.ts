import { expect } from 'storybook/test'

import { WHOLE_WAY } from './journey.ts'
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
  /** The longest wait between two frames of the watch, in milliseconds. */
  slowest: number
}

/** The mark's own attribute, and its shape's: what the watch looks for in the list. */
const MARK = '[data-sliding-mark]'
const SHAPE = '[data-mark-shape]'

/** How many frames in a row the mark has to stay put for its journey to be over. */
const STILL_FRAMES = 12

/** How long a journey may take before the watch gives up on it, in milliseconds. */
const LONGEST = 3000

export async function watchMark(list: Element, move: () => Promise<void>): Promise<MarkWatch> {
  await markAtRest(list)
  const style = document.createElement('style')
  style.textContent = `${SHAPE} { pointer-events: auto !important; }`
  document.head.append(style)
  const buried: string[] = []
  const seen = new Set<string>()
  let frames = 0
  let still = 0
  let last = ''
  let moving = true
  let slowest = 0
  let previous = performance.now()

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
      const now = performance.now()
      slowest = Math.max(slowest, now - previous)
      previous = now
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
  return { frames, places: seen.size, buried, slowest }
}

/**
 * Waits for the mark to stand on its item before a journey is asked of it.
 *
 * A list puts its mark on the chosen item before its first paint, but motion writes a placement
 * on its own frame loop, so the frame after mounting is the earliest the mark is drawn there. A
 * play started at once, as a story run alone is, would otherwise click while the mark is still
 * at the list's corner with no size, and watch a journey from nowhere: the first frames of it
 * are a mark narrower than its shape's insets, which draws nothing a hit test can find.
 */
function markAtRest(list: Element): Promise<void> {
  return new Promise((rested, failed) => {
    const started = performance.now()
    let still = 0
    let last = ''
    const frame = (): void => {
      const mark = list.querySelector<HTMLElement>(MARK)
      const shape = mark?.querySelector<HTMLElement>(SHAPE)
      if (mark !== null && mark !== undefined && shape !== null && shape !== undefined) {
        const box = shape.getBoundingClientRect()
        const point = centreOf(mark, shape)
        const at = `${point.x.toFixed(1)},${point.y.toFixed(1)}`
        still = box.width > 0 && box.height > 0 && at === last ? still + 1 : 0
        last = at
      }
      if (still >= STILL_FRAMES) {
        rested()
        return
      }
      if (performance.now() - started > LONGEST) {
        failed(new Error('The mark never came to rest on its item before the move.'))
        return
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

/** A point of the screen, in the pixels `elementsFromPoint` takes. */
interface Point {
  x: number
  y: number
}

/**
 * Whether a watch saw nothing either way: the mark at two places only, where it was and where it
 * landed, while a frame came later than the whole of a journey after the one before it.
 *
 * On a machine busy with the rest of the run a frame can come half a second after the one before
 * it, and a mark's spring is home by then: it travelled, and no frame was there to see it. That
 * is not a jump — a jump is two places with frames close together.
 */
function unseen(watched: MarkWatch): boolean {
  return watched.places <= 2 && watched.slowest >= WHOLE_WAY && !movesLess()
}

/**
 * Watches the mark out to one item and back to another: the way down and the way up, the way
 * out and the way home. Two journeys, one after the other, because the second starts where the
 * first one landed.
 *
 * Played again, up to five times, while one of the two was unseen: there and back leaves the mark
 * where it started, so each round is the same two journeys. What is answered is the last round,
 * with every frame any round saw a sibling over the mark: a mark buried once is buried.
 */
export async function watchThereAndBack(
  list: Element,
  there: () => Promise<void>,
  back: () => Promise<void>,
): Promise<MarkWatch[]> {
  const buried: string[] = []
  for (let round = 1; ; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one journey at a time: the second starts where the first landed
    const out = await watchMark(list, there)
    // oxlint-disable-next-line no-await-in-loop -- one journey at a time: the second starts where the first landed
    const home = await watchMark(list, back)
    if (round === 5 || !(unseen(out) || unseen(home))) {
      return [{ ...out, buried: [...buried, ...out.buried] }, home]
    }
    buried.push(...out.buried, ...home.buried)
  }
}

/**
 * What every play of a mark asserts: no frame of any journey had a sibling item over the mark,
 * and each journey was one — a mark seen at two places only never travelled, unless the page is
 * asking for less movement, where jumping is the rule.
 */
export function expectNeverBuried(watches: MarkWatch[]): void {
  for (const watched of watches) {
    expect(watched.buried).toEqual([])
    if (!movesLess()) expect(watched.places, 'the mark jumped to its item').toBeGreaterThan(2)
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
