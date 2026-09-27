import type { ReactNode } from 'react'

import { Loading } from '../components/loading/loading.tsx'

/**
 * What the window shows while it starts: the design system's loader, centred on the page's own
 * background, until the first page is ready (issue #185).
 *
 * The page writes this markup once more, by hand, in its `index.html`, so that it is on the first
 * frame, before a line of script has run: the classes there are these, and they only exist in
 * the stylesheet because this file uses them. The background is the one the frame is painted
 * with, so nothing flashes between the frame, this screen and the first page.
 */
export const START_LABEL = 'Starting Hemera'

const SCREEN = 'flex h-screen items-center justify-center bg-background text-muted-foreground'

export function StartScreen(): ReactNode {
  return (
    <div className={SCREEN}>
      <Loading size="lg" label={START_LABEL} />
    </div>
  )
}
