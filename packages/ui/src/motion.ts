import { MotionConfigContext, useReducedMotion } from 'motion/react'
import type { Easing, TargetAndTransition, Transition } from 'motion/react'
import { type RefObject, useContext, useEffect, useRef, useState } from 'react'

/**
 * The motion personality of Hemera: a closed set of presets, and nowhere else to write a
 * spring. A lint check refuses a `stiffness`, a `damping` or a duration written anywhere but
 * this file, because a design system whose springs are scattered has no personality at all.
 *
 * Two of them, and not one, because one cannot do both jobs. The spring the prototype earned
 * is made for a panel that arrives without overshooting, and it takes its time doing it; under
 * a finger it takes so long to settle that a three per cent press is not visible at all. What
 * answers the hand has to be stiff and light, and what arrives on its own has to be soft.
 *
 * A third preset arrived with the shell, for the one thing neither of these serves: a width
 * that changes. The set is meant to stay short.
 */

/** What answers the hand: hover, press, a width following what the press changed. */
export const press: Transition = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 }

/** What puts itself in place: panels, popups, a swap of content. The prototype's own spring. */
export const arrival: Transition = { type: 'spring', stiffness: 170, damping: 26 }

/**
 * What changes size in place: the sidebar folding to its rail and opening back out (D2-03).
 *
 * The other two presets are made for a transform, where a little overshoot reads as life. A
 * dimension that overshoots reads as a mistake — the panel goes past its width and the
 * columns beside it come back to meet it — so this one sits just past critical damping and
 * arrives without ever turning round.
 */
export const morph: Transition = { type: 'spring', stiffness: 260, damping: 33, mass: 1 }

/**
 * How the active tab crosses the strip, as two edges rather than one slab (design D2-02).
 *
 * A slab that slides keeps its width the whole way and reads as a piece of chrome being moved.
 * Two edges let it stretch: the mark first opens far enough to cover both the tab it is leaving
 * and the tab it is going to, then closes onto the second — so it reads as one sheet reaching
 * across rather than as a rectangle in transit.
 *
 * `reach` is the opening, a tween because it has one job and no weight to it. `lead` is the
 * edge in the direction of travel closing first, and `trail` the one behind it closing after,
 * which is what leaves the stretch. `settle` is what takes the trailing edge off the small
 * overshoot it lands with.
 */
export const reach: Transition = { duration: 0.19, ease: [0.23, 1, 0.32, 1] }
export const lead: Transition = { type: 'spring', duration: 0.3, bounce: 0 }
export const trail: Transition = { type: 'spring', duration: 0.3, bounce: 0.2 }
export const settle: Transition = { duration: 0.16, ease: [0.23, 1, 0.32, 1] }

/** How long the mark stays open before the edges begin to close, in seconds. */
export const REACH_HANDOFF = 0.15

/** How far the trailing edge overshoots before it relaxes, in pixels. */
export const REACH_OVERSHOOT = 3

/** The same arrival, with nothing in between: what a system asking for less movement gets. */
export const instant: Transition = { duration: 0 }

/**
 * How far the edges of a control travel under the hand, in pixels: inwards while it is pressed,
 * outwards while the pointer is over it (issue #108).
 *
 * A share of the element's own size cannot say this. The same ratio pulls the edges of a wide
 * control in by several pixels and moves a small one by almost nothing: a Select filling a
 * dialog caves in while the icon button beside it barely answers. What has to match between two
 * controls is the movement, so these are pixels, and the share is computed from the box
 * `useHand` measured.
 *
 * Both stay under two pixels on purpose: enough to read as giving way, little enough that a
 * label never leaves the room the layout gave it.
 */
export const PRESS_EDGE = 1.5
export const LIFT_EDGE = 1

/** The box a control took in the layout, which its press is a share of. */
export interface ControlBox {
  readonly width: number
  readonly height: number
}

/**
 * What a control is drawn at under the hand: the share of itself, one per axis.
 *
 * A type and not an interface on purpose: motion takes a `Target`, and an interface is not
 * assignable to one, which has an index signature an interface does not inherit.
 */
export type Scales = {
  readonly scaleX: number
  readonly scaleY: number
}

/** Nothing at all: what a control whose box is not known yet is drawn at. */
export const STILL: Scales = { scaleX: 1, scaleY: 1 }

/**
 * The shares that move each edge of a box by `edge` pixels: inwards when `edge` is positive,
 * outwards when it is negative. A box the layout has not measured yet is left alone, because a
 * share computed from a width of zero is not a press.
 */
export function edgeScale(box: ControlBox, edge: number): Scales {
  if (box.width < 1 || box.height < 1) return STILL
  return { scaleX: 1 - (2 * edge) / box.width, scaleY: 1 - (2 * edge) / box.height }
}

/**
 * The scale a mark arrives at on a control, and leaves by: the Composer's attachments and its
 * actions come in small, so they read as something landing rather than as a label appearing.
 *
 * Not a press. Since #108 nothing in the catalogue gives under the hand by a share of itself —
 * what was the compact press of the catalogue is what a mark arriving is drawn at.
 */
export const MARK_SCALE = 0.86

/** How far the mark of a state travels in from under the edge, in pixels. */
export const MARK_TRAVEL = 12

/**
 * How far the foot of a message travels as it appears, in pixels.
 *
 * Less than a mark and less than a label: the foot is a line of small type under a bubble, and
 * what it has to read as is the bubble settling rather than as a piece of chrome being moved.
 */
export const FOOT_TRAVEL = 6

/** How far the label of a folding panel slides in from, in pixels. */
export const LABEL_TRAVEL = 8

/**
 * How long the labels of a folding panel let the width go first, in the seconds motion counts
 * in. Opening only: on the way out they leave at once, because a label still sitting in a rail
 * that has already closed is the one frame that reads as a bug.
 */
export const LABEL_DELAY = 0.08

/**
 * The durations of the theme, in the seconds motion counts in.
 *
 * `turn` is the long one the stylesheet already spins and breathes on — `--duration-turn` —
 * and it is written here so that what motion repeats keeps the same beat as what CSS repeats.
 */
export const durations = { fast: 0.16, base: 0.26, slow: 0.4, turn: 1.2 } as const

/** The curve the theme's `--ease-calm` draws, for the few transitions that are not a spring. */
export const easing: Easing = [0.25, 0.8, 0.25, 1]

/**
 * The transition to animate with, which is the preset asked for unless less movement was.
 *
 * motion's own `reducedMotion` jumps a transform to its target and keeps animating opacity and
 * colour. What reduced motion has to mean here is the end state without the journey, for every
 * property at once, so the journey is given no time instead. The tree still runs under
 * `MotionConfig reducedMotion="user"`: it is the net under any motion element that forgets
 * this hook, and the lint refuses one that does.
 *
 * Both ways of asking are honoured: the system preference, and a `MotionConfig` that says
 * `always`. `never` is not one of them, because `never` is also motion's own default: a
 * component rendered outside any `MotionConfig` reads it, and reading it as "this tree opted
 * out" is how the one guard the design system has ends up switched off by nobody.
 */
export function useTransition(preset: Transition = arrival): Transition {
  const { reducedMotion } = useContext(MotionConfigContext)
  const system = useReducedMotion()
  if (reducedMotion === 'always') return instant
  return system === true ? instant : preset
}

/**
 * The hand of a control: what carries it, and what it is drawn at under the pointer and the
 * press.
 */
export interface Hand {
  readonly element: RefObject<HTMLButtonElement | null>
  readonly hover: Scales
  readonly tap: Scales
}

/**
 * What a control answers the hand with: what it wears while the pointer is over it, and while it
 * is pressed, both computed from the box it actually took.
 *
 * The press is decided here and nowhere else (issue #108): a control spreads `hover` into
 * `whileHover` and `tap` into `whileTap`, and every one of them — a narrow button, a Select
 * filling a dialog, an icon button — gives by the same `PRESS_EDGE` pixels. The box is read with
 * `offsetWidth`, which is the layout's and not what a transform is doing to it, and it is
 * followed, because a control whose label changed is no longer the size it was measured at.
 *
 * `element` goes on the element that carries the press; it is what the box is read from.
 */
export function useHand(): Hand {
  const element = useRef<HTMLButtonElement | null>(null)
  const [box, setBox] = useState<ControlBox | null>(null)
  useEffect(() => {
    const node = element.current
    if (node === null) return
    const measure = (): void => {
      const { offsetWidth: width, offsetHeight: height } = node
      // A box without a size says nothing, and a box that did not change is the one already
      // held: neither is worth a render.
      if (width < 1 || height < 1) return
      setBox((before) =>
        before?.width === width && before.height === height ? before : { width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])
  if (box === null) return { element, hover: STILL, tap: STILL }
  return { element, hover: edgeScale(box, -LIFT_EDGE), tap: edgeScale(box, PRESS_EDGE) }
}

/**
 * Which way a surface is travelling, from the reader's side: on into the next thing, or back
 * to where they came from. The same kind plays both, mirrored, so a panel never comes back the
 * way it went.
 */
export type SlideDirection = 'forward' | 'backward'

/**
 * How far a slide goes, and the two answers a surface ever needs.
 *
 * `stage` is a swap: one surface leaves by its own width and the next arrives from the other
 * side, so what is read is a replacement — the agent stage of the model menu giving way to the
 * models. `nudge` is the same movement kept short, for a surface that is being replaced *in
 * place* while the frame around it does not move at all: the models column of the two-column
 * menu changing agent. A nudge as long as a swap reads as the whole panel sliding; a swap as
 * short as a nudge reads as a list that was there all along.
 */
export const SLIDE = { stage: '100%', nudge: '12%' } as const

/** Which of the two distances a slide is drawn at. */
export type SlideDistance = keyof typeof SLIDE

/** Where a sliding surface comes in from, and where the one it replaces goes out to. */
export interface Slide {
  enter: string
  leave: string
}

/**
 * The `slide` kind: a surface arriving from one side while the one it replaces leaves by the
 * other, at one of the two distances and in one of the two directions.
 *
 * The timing is not its own — a slide is something putting itself in place, so it is played on
 * `arrival` like everything else that does. Only the geometry lives here, which is the whole
 * reason it is a kind and not a pair of constants in whichever component needed it first.
 */
export function slide(distance: SlideDistance, direction: SlideDirection = 'forward'): Slide {
  const away = SLIDE[distance]
  const back = `-${away}`
  return direction === 'forward' ? { enter: away, leave: back } : { enter: back, leave: away }
}

/**
 * The `expand` and `collapse` kinds: a body whose height is its own, growing and folding away.
 *
 * Height and a fade together. The height is what makes room — the page under it moves over
 * rather than being redrawn — and the fade is what keeps the clipped edge from reading as a
 * line of text cut in half on the way. A tool call's body, a thought, a menu panel whose stage
 * is taller than the last one: all of them are this.
 *
 * The fade is a `filter` and not an `opacity`, for the reason the foot of a message gives: the
 * accessibility check of the catalogue measures a text's contrast through an opacity and
 * refuses the value it reads mid-flight, while a filter is not part of what it measures.
 *
 * Played on `morph`, which is the spring made for a dimension: it arrives without turning
 * round, and a body that overshot its height would take the whole column below it along.
 */
export const expand = { height: 'auto', filter: 'opacity(1)' } as const
export const collapse = { height: 0, filter: 'opacity(0)' } as const

/**
 * The `fold` kind: what a body that was still growing leaves on.
 *
 * The same spring by name rather than one written here of its own — and with no speed to carry.
 * A dimension turned round mid-flight keeps the speed it had, and the room then goes on growing
 * for the frame the press landed on — 6.8 px in the light theme and 7.4 px in the dark, measured
 * on a body of twelve lines — which reads as a fold that did not hear the hand (issue #64). A
 * fold has to leave from where it is, so the spring starts from rest whichever way it is going.
 */
export const fold: Transition = { ...morph, velocity: 0 }

/**
 * The `push` kind: what a neighbour does when the thing above it grows or folds away.
 *
 * The same spring the growth itself is played on, deliberately and by name rather than by
 * reaching for `morph` at the call site — because the one thing a push must never do is arrive
 * on a different beat from what pushed it. Read it on `layout`, where motion measures where
 * each block ended up and plays the difference.
 */
export const push: Transition = morph

/**
 * The `crossfade` kind: one content giving way to another in the same place, in opacity alone.
 *
 * For a box whose frame stays where it is while what it holds is replaced — the tabs of the
 * details of a Session, where the panel inside the dialog changes and the dialog only follows its
 * height. A slide
 * there would say the new panel came from somewhere; it did not, it was behind its tab all
 * along, and what has to be read is the same room showing something else. The stage of the Spec
 * panel is that room too: it shows one part of a Spec at a time, and a reader walking the
 * outline with the arrows is never kept waiting on the change.
 *
 * The panel that is left goes at once and the one that is chosen comes up from transparent on
 * the theme's `fast` beat: short enough that the two read as one crossing, where a panel that
 * took its time would read as a page loading. A tween and not a spring, because an opacity has
 * no weight to carry and nothing to overshoot.
 *
 * The fade is a `filter`, for the reason `expand` gives: the accessibility check of the
 * catalogue measures a text's contrast through an opacity and refuses what it reads mid-flight.
 * `CROSSFADE` is where the content starts and where it lands; a reader asking for less movement
 * is answered by `useTransition` with `instant`, which is the landing and no fade at all.
 */
export const crossfade: Transition = { duration: durations.fast, ease: easing }
export const CROSSFADE = {
  from: { filter: 'opacity(0)' },
  to: { filter: 'opacity(1)' },
} as const

/**
 * The `ping` kind: a ring leaving what is running, over and over.
 *
 * A dot that is breathing says "this is the state you are waiting on" in opacity alone, which
 * is read once the eye is already on it. A ring that expands out of the dot and fades is read
 * from the corner of the eye, which is where a reader watching a thread actually is — and it
 * costs nothing but a transform and an opacity on an element that is eight pixels wide.
 *
 * The two of them are one kind: `ping` is what the ring travels through — out to `PING_REACH`
 * of its own size while it goes from `PING_OPACITY` to nothing — and `pinging` is the beat it
 * repeats on, the theme's own `turn`, so the ring leaves on the same beat the dot breathes on
 * rather than against it.
 *
 * A reader asking for less movement is given no ring at all rather than a ring with no time to
 * travel in: `useTransition` answers `instant`, and what repeats for ever at no duration is a
 * ring stuck at full size. The component reads that answer and draws nothing.
 */
export const PING_REACH = 2.6
export const PING_OPACITY = 0.45
export const ping: TargetAndTransition = { scale: [1, PING_REACH], opacity: [PING_OPACITY, 0] }
export const pinging: Transition = {
  duration: durations.turn,
  ease: easing,
  repeat: Number.POSITIVE_INFINITY,
}

/**
 * The `swap` kind: two surfaces trading places at the window's edge, in two moves that overlap —
 * the Spec folded to its small frame, and the Spec open as its panel (issue #164).
 *
 * The surface that leaves goes first, out by the edge; a beat later, while it is still going, the
 * one that arrives comes in from that edge. The two moves always overlap, so there is no frame
 * where neither is there, and the whole exchange is about a third of a second: a gesture, not a
 * scene.
 *
 * - `move` is what the panel slides on, and what the chat beside it is pushed on: `lead`, the
 *   quickest spring of the preset that still reads as a slide, started from rest so that a swap
 *   turned round half-way leaves from where it is rather than carrying on for a frame.
 * - `fade` is what the small frame slides and fades on: the same spring as the panel. A shorter
 *   fade would be all but gone by the time the beat is over and the panel shows, which reads as
 *   a moment with nothing at the edge; on one spring the frame is still leaving as the panel
 *   comes in, and still arriving as it goes.
 * - `beat` is how long the second move waits for the first, the beat a folding panel's labels
 *   already wait for its width.
 *
 * A reader asking for less movement gets both moves at once, with no beat between them: read
 * `move` and `fade` through `useTransition`, and delay the second through `onTheBeat`.
 */
export const swap = {
  move: { ...lead, velocity: 0 },
  fade: { ...lead, velocity: 0 },
  beat: LABEL_DELAY,
} as const

/**
 * The second move of a swap: the transition it is handed, a beat late. `instant` stays instant —
 * a reader asking for less movement has nothing to wait for.
 */
export function onTheBeat(transition: Transition): Transition {
  return transition === instant ? instant : { ...transition, delay: swap.beat }
}

/**
 * The `check` kind: a tick drawing itself when a box is checked, and undrawing when it is not
 * (issue #185).
 *
 * - `draw` is what the stroke's length travels on: the theme's `base` beat, on a curve that sets
 *   off fast and lands slowly, so the tick reads as a pen stroke rather than as a bar filling.
 * - `press` and `pressed` are the small give of the box as it is checked: down to `CHECK_PRESS`
 *   of itself and back, on the `fast` beat. A tween and not a spring, because it passes through
 *   three values and a spring only goes to one.
 *
 * A reader asking for less movement gets the tick drawn and the box still: read both through
 * `useTransition`, which answers `instant`.
 */
export const CHECK_PRESS = 0.92
export const check = {
  draw: { duration: durations.base, ease: [0.16, 1, 0.3, 1] },
  press: { duration: durations.fast, ease: easing },
  pressed: { scale: [1, CHECK_PRESS, 1] },
} as const satisfies { draw: Transition; press: Transition; pressed: TargetAndTransition }

/**
 * The `face` kind: the beats Hemera's face lives on (issue #140).
 *
 * The face is not moved by motion. Every expression it has is the same seven numbers per stroke
 * moved around, eased on the frame by the face's own player, so that any shape travels into any
 * other and a change that arrives half-way through another is taken from wherever the face is.
 * What that player plays by is written here, in one table, so that whatever documents the face
 * reads the real numbers and the lab that tries others starts from them.
 *
 * - `blink`: the lid coming down, and going back up a little slower, the way a real one moves;
 *   `gap` is what separates the two halves of a double blink, long enough to read as two and
 *   short enough to read as one gesture. `hold` is how long a lid stays shut when a change of
 *   state is carried across it — the way an animator cuts on a blink.
 * - `shape`: a change of shape inside a state: a gesture pulling one eye, a flourish handing it
 *   back.
 * - `handover`: how long a new gesture takes to take the head over from the one before it. The
 *   head is handed on, never seized: a gesture that seized it would snap it to wherever its own
 *   first frame is.
 * - `change`: how long each change of state lasts, by what it says. Going from one kind of work
 *   to another is a glance and a flinch is quick; falling asleep and waking up are not.
 * - `spin`: one turn of the loading orbit, on the same beat the loading indicator turns on, so a
 *   face that stands in for one goes round as fast.
 * - `fade`: the one thing a reader asking for less movement is still given — a soft cross-fade
 *   from one still expression to the next, in opacity alone, so the face never jumps at them.
 */
export const face = {
  blink: { down: 0.09, up: 0.15, gap: 0.09, hold: 0.06 },
  shape: 0.28,
  handover: 0.42,
  change: {
    shift: 0.36,
    focus: 0.6,
    alert: 0.66,
    resume: 0.62,
    turn: 0.5,
    cheer: 0.95,
    flinch: 0.8,
    recover: 0.9,
    drift: 2.4,
    wake: 1.4,
    boot: 0.8,
    gather: 0.65,
  },
  spin: durations.turn,
  fade: durations.slow,
} as const

/**
 * How far a number of the face has travelled at a share `k` of its change: at rest at both
 * ends and fastest in the middle.
 *
 * Not the theme's `easing`, which eases out only. That reads as calm on a panel putting itself in
 * place in a quarter of a second, and as a snap followed by a long tail on a face, where a change
 * is slow enough to be watched: an eye has to build into its new shape and then arrive.
 */
export function faceArrive(k: number): number {
  const q = Math.min(1, Math.max(0, k))
  return q * q * (3 - 2 * q)
}

/**
 * How far a number of the face has gone at a share `k` of a change of speed eased on
 * `faceArrive`, for a change of one: what a speed that builds and settles has covered, and past
 * the end of the change, everything it covers at its new speed.
 */
export function faceArriveSpan(k: number): number {
  if (k <= 0) return 0
  if (k >= 1) return 0.5 + (k - 1)
  return k ** 3 - k ** 4 / 2
}

/**
 * How far a number of the face coasts at a share `k` of a change, in lengths of it and for a speed
 * of one: the speed dies away evenly and is spent at the end. How the loading orbit stops when a
 * change that does not know it takes it over.
 */
export function faceCoast(k: number): number {
  const q = Math.min(1, Math.max(0, k))
  return (q * (2 - q)) / 2
}

/**
 * What is left of the speed a number of the face had when a change took it over, at a share `k`
 * of the change and in lengths of it.
 *
 * A change arriving half-way through another leaves from where the face is, and at the speed it
 * had: a head turning left that is told to look right finishes the turn it was in rather than
 * stopping dead on the frame the word came, and has spent that speed by the end of the change.
 * Nothing is left of it at either end, so the change still arrives at rest.
 */
export function faceCarry(k: number): number {
  const q = Math.min(1, Math.max(0, k))
  return q * (1 - q) * (1 - q)
}

/**
 * The `rise` kind: what comes out from behind the edge it is attached to, and goes back behind it
 * — the Session's notices, rising out of the composer's top edge (issue #237).
 *
 * `RISE.hidden` is the element moved down by its whole height, which puts it entirely behind the
 * surface it sits on; `RISE.shown` is its place. The spring is `arrival`'s, by name: it puts
 * itself in place without overshooting, and the overshoot, when there is one, is `pop`'s.
 */
export const rise: Transition = arrival
export const RISE = {
  hidden: { y: '100%' },
  shown: { y: 0 },
} as const

/**
 * The `pop` kind: a scale past its size and back, once, for what must not be missed as it lands —
 * the notices once they have risen, and again each time something new joins them (issue #237).
 *
 * It is the one thing of the catalogue that overshoots on purpose, which is why it is a kind of
 * its own and not a spring of `arrival`'s: out to `POP_REACH`, a little under its size on the way
 * back, and settled, on the theme's `slow` beat. A tween and not a spring, because it passes
 * through three values and a spring only goes to one. A reader asking for less movement is
 * answered `instant` by `useTransition`, which lands on the size it already has: no pop at all.
 */
export const POP_REACH = 1.18
export const POP_SETTLE = 0.96
export const POP = { scale: [1, POP_REACH, POP_SETTLE, 1] }
export const pop: Transition = {
  duration: durations.slow,
  ease: easing,
  times: [0, 0.4, 0.75, 1],
}
