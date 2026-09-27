/**
 * The start screen the window shows before a line of script has run (issue #185).
 *
 * The page carries it twice: in its `index.html`, which is on the first frame, and as the
 * component the application draws until its first page is ready. The two have to be one screen,
 * or the window jumps between them; this reads the file and renders the component, and holds
 * them to the same markup.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vite-plus/test'

import { StartScreen } from '../src/shell/start-screen.tsx'

const page = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'apps', 'desktop', 'src', 'renderer', 'index.html'),
  'utf8',
)

/** What the root holds before the application mounts, without comments or space between tags. */
function rootOf(html: string): string {
  const inside = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html)?.[1] ?? ''
  return inside
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/>\s+</g, '><')
    .trim()
}

describe('The window starts on a loader', () => {
  test('the page holds the start screen from its first paint', () => {
    expect(rootOf(page)).toBe(renderToStaticMarkup(createElement(StartScreen)))
  })

  test('the start screen is the design system loader, named for a screen reader', () => {
    const markup = renderToStaticMarkup(createElement(StartScreen))
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-label="Starting Hemera"')
    expect(markup).toContain('bg-background')
  })
})
