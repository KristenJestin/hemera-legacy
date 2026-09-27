import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type UserConfig, defineConfig } from 'vite-plus'

/**
 * The face lab, served on its own: a page and nothing else — no Electron, no engine, no data.
 * `pnpm face-lab` at the root serves it.
 */
export default defineConfig({
  // `@vitejs/plugin-react` is typed against the `vite` package, which Vite+ ships under its own
  // name: the same plugins, the nominal type is the only difference (as in the desktop bundles).
  // SAFETY: same Vite, two package names; the plugins' nominal type is the only difference.
  plugins: [react(), tailwindcss()] as NonNullable<UserConfig['plugins']>,
  server: { port: 6012 },
})
