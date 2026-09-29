/**
 * The start screen is drawn from the first frame, in development as in a build (issue #185).
 *
 * `index.html` writes the start screen out, but the theme it is styled with arrives through a
 * script in development, once every module of the application has been fetched: until then the
 * window showed its bare background for seconds. The page is asked of Vite here, through the
 * renderer's own bundle, and it has to carry the start screen's rules inline in its head, where
 * nothing waits for a script.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { startStyleIn } from '@hemera/ui/start-style'
import { createServer } from 'vite-plus'
import { describe, expect, test } from 'vite-plus/test'

import { rendererBundle } from '../bundles.ts'

const application = join(import.meta.dirname, '..')
const page = readFileSync(join(application, 'src', 'renderer', 'index.html'), 'utf8')
const theme = readFileSync(
  join(application, '..', '..', 'packages', 'ui', 'src', 'theme.css'),
  'utf8',
)

describe('The window starts on a loader', () => {
  test('the page holds the start screen styles inline, before any script', async () => {
    const server = await createServer({
      ...rendererBundle,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, ws: false },
    })
    try {
      const served = await server.transformIndexHtml('/', page)
      const head = /<head>([\s\S]*?)<\/head>/.exec(served)?.[1] ?? ''
      expect(head).toContain(`<style>${startStyleIn(theme)}</style>`)
    } finally {
      await server.close()
    }
  })
})
