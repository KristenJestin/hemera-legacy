import type { ReactNode } from 'react'

/**
 * What the Session's frame shows, as one contract (exploration of issue #333).
 *
 * The frame holds a base — the build in a `build` Session — and the views opened on top of it: the
 * frozen Spec, a task, a review round, a delivery. Every one of them is handed to the frame the
 * same way, so the frame draws its head, its navigation and its width from this and nothing else.
 */

/** Where a view would rather lie: beside the chat, or over it for the room it needs. */
export type ViewWidth = 'beside' | 'over'

export interface PanelView {
  /** The view's own name in the frame: `Spec`, `T2`, `Review · round 1`. */
  title: string
  /** Its icon, before the title in a crumb or a tab. */
  icon: ReactNode
  /** The width it asks for as it opens; the hand may change it once it is there. */
  width: ViewWidth
  /** What it adds to the frame's head while it is the one shown: its marks and its buttons. */
  actions?: ReactNode
  body: ReactNode
}

/** How the frame's head moves between the base and its views. */
export type Variant = 'stack' | 'tabs'

/** One view open in the frame, and the width the frame has while it is shown. */
export interface Opened {
  id: string
  over: boolean
}

/** Where the frame stands: the views open on the base, the one shown, the base's own width. */
export interface FrameState {
  open: readonly Opened[]
  /** The view shown, or null for the base. */
  shown: string | null
  baseOver: boolean
}

/** The width the frame has now: the one of what it shows. */
export function overOf(state: FrameState): boolean {
  if (state.shown === null) return state.baseOver
  return state.open.find((one) => one.id === state.shown)?.over ?? state.baseOver
}

/**
 * Opens a view. A stack pushes it on top, or goes back down to it when it is already open; tabs add
 * it at the end, or show it when it is already there. It opens at the width it asks for, or at the
 * frame's own when the frame already lies over the chat.
 */
export function openView(
  state: FrameState,
  variant: Variant,
  id: string,
  width: ViewWidth,
): FrameState {
  const at = state.open.findIndex((one) => one.id === id)
  if (at !== -1) {
    const open = variant === 'stack' ? state.open.slice(0, at + 1) : state.open
    return { ...state, open, shown: id }
  }
  const opened = { id, over: width === 'over' || overOf(state) }
  return { ...state, open: [...state.open, opened], shown: id }
}

/** Closes a view and whatever a stack had pushed over it; what was under it is shown again. */
export function closeView(state: FrameState, variant: Variant, id: string): FrameState {
  const at = state.open.findIndex((one) => one.id === id)
  if (at === -1) return state
  if (variant === 'stack') {
    const open = state.open.slice(0, at)
    return { ...state, open, shown: open.at(-1)?.id ?? null }
  }
  const open = state.open.filter((one) => one.id !== id)
  if (state.shown !== id) return { ...state, open }
  return { ...state, open, shown: open[at - 1]?.id ?? null }
}

/** Shows the base, or a view already open: a crumb or a tab pressed. */
export function showView(state: FrameState, variant: Variant, id: string | null): FrameState {
  if (id === null)
    return variant === 'stack' ? { ...state, open: [], shown: null } : { ...state, shown: null }
  return openView(state, variant, id, 'beside')
}

/** The hand lays the frame over the chat or takes it back: for what is shown, and for it alone. */
export function layView(state: FrameState, over: boolean): FrameState {
  if (state.shown === null) return { ...state, baseOver: over }
  return {
    ...state,
    open: state.open.map((one) => (one.id === state.shown ? { ...one, over } : one)),
  }
}
