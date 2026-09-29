import type { Theme } from './window.ts'

/**
 * Reading a value out of the theme's own text (D1-02).
 *
 * Kept apart from `window.ts` and free of any stylesheet import, so a build script run by Node can
 * read the theme the same way the main process does: the file on disk is the one source, and
 * these two functions are the one way a value is taken out of it.
 */

/** The block of a stylesheet a theme's roles are declared in. */
const BLOCK: Record<Theme, RegExp> = {
  light: /^:root\s*\{([\s\S]*?)^\}/m,
  dark: /^\.dark\s*\{([\s\S]*?)^\}/m,
}

function declaration(source: string, name: string): RegExpExecArray | null {
  return new RegExp(String.raw`^\s*--${name}\s*:\s*([^;]+);`, 'm').exec(source)
}

/** The value a role is given in one theme's block, `--background` in `.dark` for instance. */
export function roleIn(source: string, name: string, theme: Theme): string {
  const block = BLOCK[theme].exec(source)
  if (block === null) throw new Error(`the theme declares no ${theme} block`)
  const found = declaration(block[1]!, name)
  if (found === null) throw new Error(`the ${theme} theme declares no --${name}`)
  return found[1]!.trim()
}

/** The value a token that does not change with the theme is declared with, a size or a duration. */
export function tokenIn(source: string, name: string): string {
  const found = declaration(source, name)
  if (found === null) throw new Error(`the theme declares no --${name}`)
  return found[1]!.trim()
}
