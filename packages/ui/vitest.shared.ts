import { join } from 'node:path'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { type Plugin, defineConfig } from 'vitest/config'
import type { BrowserCommand } from 'vitest/node'

/**
 * Tells the page what the system prefers about movement, for `emulateReducedMotion`.
 *
 * Through the page Playwright already drives, rather than a DevTools session a story attaches of
 * its own: with both themes run at once, such a session's first message was seen to go
 * unanswered for longer than a test is given, where the page's own line answered in seconds.
 */
const prefersReducedMotion: BrowserCommand<[preference: 'reduce' | 'no-preference']> = async (
  { page },
  preference,
) => {
  await page.emulateMedia({ reducedMotion: preference })
}

/**
 * The prebundled dependencies handed to a page without their source maps.
 *
 * The dev server writes a module's map into the module, as base64, every time a page asks for it,
 * and every story file is a page that asks for every dependency again: the icons alone carry a
 * map of nine megabytes. With both themes run at once that work held the runner's one thread for
 * up to seventeen seconds at a time, and everything a story waits on from the runner — a module,
 * a font, the preference for less movement — waited behind it, past the time a test is given. A
 * stack that goes through a dependency reads its bundled code instead of its sources, which is
 * all this costs.
 */
const withoutDependencyMaps: Plugin = {
  name: 'hemera:without-dependency-maps',
  apply: 'serve',
  transform(code, id) {
    const { environment } = this
    if (environment.mode !== 'dev') return null
    if (environment.depsOptimizer?.isOptimizedDepFile(id) !== true) return null
    return { code, map: { mappings: '' } }
  },
}

/**
 * A dependency cache of the theme's own.
 *
 * The Storybook plugin names the cache after the Storybook folder, which both themes share, so
 * the two dev servers prebundled the dependencies into one folder at the same moment, each
 * replacing what the other was writing (#253). Twice on a Windows runner, one theme then stopped
 * running stories, once before its first, and the run sat until its step was cut: that folder
 * was the one thing the two themes wrote to together.
 */
function ownDependencyCache(theme: 'light' | 'dark'): Plugin {
  return {
    name: 'hemera:own-dependency-cache',
    config: (config) => ({ cacheDir: `${config.cacheDir ?? 'node_modules/.vite'}-${theme}` }),
  }
}

/**
 * The catalogue run as tests in a real Chromium, once per theme (design D1-06).
 *
 * A story is not written twice to be seen in both themes — the toolbar swaps the theme on any
 * story at any moment, and a story that pins one is a story that lies about the component.
 * What has to happen twice is the *run*: a contrast that passes on white can fail on black,
 * and only the runner can be in both places at once. So the theme is a project, not a story.
 */
export function catalogue(theme: 'light' | 'dark') {
  return defineConfig({
    plugins: [
      storybookTest({
        configDir: join(import.meta.dirname, '.storybook'),
        initialGlobals: { theme },
      }),
      withoutDependencyMaps,
      ownDependencyCache(theme),
    ],
    // Declared rather than discovered: a dependency the optimizer meets for the first time
    // mid-run makes it reload the page under the tests, and a run that reloads is a run that
    // fails for no reason anyone can act on.
    optimizeDeps: {
      include: [
        '@base-ui/react/button',
        '@base-ui/react/dialog',
        '@base-ui/react/field',
        '@base-ui/react/menu',
        '@base-ui/react/popover',
        '@base-ui/react/radio',
        '@base-ui/react/radio-group',
        '@base-ui/react/select',
        '@base-ui/react/tabs',
        '@base-ui/react/tooltip',
        '@tabler/icons-react',
        '@tanstack/react-form',
        '@tanstack/react-hotkeys',
        'class-variance-authority',
        'cn',
        'motion/react',
        'zod',
      ],
    },
    test: {
      name: `storybook-${theme}`,
      root: import.meta.dirname,
      // Some of what a story waits on is the browser's to give and not the story's: the preference
      // for less movement applied to the page, a font the page loads. With both themes run at once
      // — two dozen pages in one browser — applying the preference alone was measured at up to
      // eleven seconds, against the fifteen a test is given by default, and handing it back is a
      // hook that waits on the same. The waits inside a story keep their own patience; this is
      // the room around them.
      testTimeout: 30_000,
      hookTimeout: 30_000,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
        commands: { prefersReducedMotion },
      },
    },
  })
}
