import stylesheet from './theme.css?raw'
import { roleIn } from './tokens.ts'

/**
 * The colours the main process paints the window with, read out of the theme itself (D1-02).
 *
 * Electron needs a string before there is a page to ask, so the frame and the system's window
 * buttons are painted from the same file the page is styled from. Reading the stylesheet is
 * what keeps them the same value: a second list would be a second thing to remember.
 *
 * The reading is a pure function over the text, and the text is imported beside it. That split
 * is not decoration: a bundler hands over the file's contents, a test runner hands over an
 * empty string for a stylesheet it has nowhere to put, and what the lot claims about these
 * values has to be checkable against the file on disk either way.
 */
export type Theme = 'light' | 'dark'

/**
 * What a user may choose, which is one more than what a window can wear.
 *
 * `system` is a choice and not a colour: it resolves to one of the two above, and which one is
 * the desktop's to say. The design system declares it here rather than reading it from the
 * application's shared declaration, which it is not allowed to import — a component that knew
 * about Hemera's channels would stop being renderable on its own.
 */
export type ThemeChoice = Theme | 'system'

export interface WindowColors {
  /** What the frame is painted with before anything is drawn in it. */
  background: string
  /** What the system draws its window buttons in. */
  foreground: string
}

/** The window colours a given stylesheet declares for a theme. */
export function colorsIn(source: string, theme: Theme): WindowColors {
  return {
    background: roleIn(source, 'background', theme),
    foreground: roleIn(source, 'foreground', theme),
  }
}

/** How tall the overlay is in a given stylesheet, in the pixels Electron counts chrome in. */
export function heightIn(source: string): number {
  const found = /^\s*--spacing-title-bar\s*:\s*([\d.]+)rem;/m.exec(source)
  if (found === null) throw new Error('the theme declares no --spacing-title-bar')
  // The page's own root size, which nothing in the application changes.
  const ROOT_FONT_SIZE = 16
  return Number(found[1]) * ROOT_FONT_SIZE
}

export function windowColors(theme: Theme): WindowColors {
  return colorsIn(stylesheet, theme)
}

export function titleBarHeight(): number {
  return heightIn(stylesheet)
}
