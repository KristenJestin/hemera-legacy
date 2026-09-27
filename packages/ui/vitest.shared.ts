import { join } from 'node:path'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { type Plugin, defineConfig } from 'vitest/config'

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
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
    },
  })
}
