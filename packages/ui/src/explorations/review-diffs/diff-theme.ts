import { registerCustomTheme } from '@pierre/diffs'
import { useSyncExternalStore } from 'react'
import { createCssVariablesTheme } from 'shiki/core'

/**
 * How the diff is coloured: by the design system, and by nothing of the library's own.
 *
 * `@pierre/diffs` highlights with Shiki and takes any Shiki theme. The one registered here is the
 * css-variables theme the thread's diffs are already drawn with (`activity/highlight.ts`): every
 * token is written as `var(--shiki-token-*)`, and `.code-diff` in `theme.css` says what each role
 * looks like in both themes. So one theme serves light and dark, the switch is the `.dark` class
 * on the document as everywhere else, and the library's own Pierre themes are never loaded.
 */
export const DIFF_THEME = 'hemera-tokens'

registerCustomTheme(DIFF_THEME, () =>
  Promise.resolve(createCssVariablesTheme({ name: DIFF_THEME, variablePrefix: '--shiki-' })),
)

/** The theme the document wears, which the library is told so its own mixes follow it. */
function documentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function watchDocumentTheme(changed: () => void): () => void {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/**
 * Whether the document is light or dark, followed live.
 *
 * The library mixes its backgrounds with `light-dark()` and sets `color-scheme` on its own root
 * from `themeType`; left on `system`, it follows the operating system rather than the `.dark`
 * class the window and the catalogue switch, and a dark window drew light diffs.
 */
export function useDocumentTheme(): 'light' | 'dark' {
  return useSyncExternalStore(watchDocumentTheme, documentTheme, () => 'light')
}
