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
import { startStyleIn } from '../src/shell/start-style.ts'
import { roleIn, tokenIn } from '../src/tokens.ts'

const page = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'apps', 'desktop', 'src', 'renderer', 'index.html'),
  'utf8',
)

const theme = readFileSync(join(import.meta.dirname, '..', 'src', 'theme.css'), 'utf8')

/** Every class the start screen is written with, as a selector says it. */
function selectorsOf(markup: string): string[] {
  const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((found) => found[1]!.split(' '))
  return [...new Set(classes)].map((name) => `.${name.replaceAll(/[.:]/g, String.raw`\$&`)}`)
}

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

  test('every class of the start screen is styled before the theme has arrived', () => {
    const style = startStyleIn(theme)
    for (const selector of selectorsOf(renderToStaticMarkup(createElement(StartScreen)))) {
      expect(style).toContain(`${selector} {`)
    }
  })

  test('the start screen is drawn in the values the theme declares', () => {
    const style = startStyleIn(theme)
    for (const mode of ['light', 'dark'] as const) {
      expect(style).toContain(`--background: ${roleIn(theme, 'background', mode)};`)
      expect(style).toContain(`--muted-foreground: ${roleIn(theme, 'muted-foreground', mode)};`)
    }
    expect(style).toContain(tokenIn(theme, 'spacing-icon-lg'))
    expect(style).toContain(tokenIn(theme, 'duration-turn'))
    const colours = style.match(/#[\da-f]{3,8}\b/gi) ?? []
    expect(colours).not.toHaveLength(0)
    for (const colour of colours) expect(theme).toContain(colour)
  })
})
