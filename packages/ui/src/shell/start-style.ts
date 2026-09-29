import { roleIn, tokenIn } from '../tokens.ts'

/**
 * The rules the start screen is drawn with before the theme's stylesheet has arrived (issue #185).
 *
 * `index.html` writes the start screen out so that it is on the first frame, but its classes only
 * mean something once the theme is loaded, and in development the theme comes in through a
 * script, after every module of the application has been fetched: until then the face has no
 * size and no colour, and the window shows its bare background for seconds. These rules go
 * inline into the page's head, so the face is drawn from the very first frame whatever serves
 * the page.
 *
 * They are the utilities of the start screen's own classes, said again with the same meaning,
 * and every value that is the theme's is read out of the theme's text rather than written here.
 * They sit in a cascade layer declared before any of Tailwind's, which makes them the weakest
 * rules of the page: once the theme is in, it decides everything, and these only repeat it.
 */
export function startStyleIn(theme: string): string {
  const roles = (selector: string, mode: 'light' | 'dark'): string =>
    `${selector} { --background: ${roleIn(theme, 'background', mode)}; ` +
    `--muted-foreground: ${roleIn(theme, 'muted-foreground', mode)}; }`

  return `@layer start-screen {
  ${roles(':root', 'light')}
  ${roles('.dark', 'dark')}
  html, body { height: 100%; margin: 0; background-color: var(--background); }
  .flex { display: flex; }
  .h-screen { height: 100vh; }
  .items-center { align-items: center; }
  .justify-center { justify-content: center; }
  .bg-background { background-color: var(--background); }
  .text-muted-foreground { color: var(--muted-foreground); }
  .inline-block { display: inline-block; }
  .block { display: block; }
  .shrink-0 { flex-shrink: 0; }
  .size-16 { width: 4rem; height: 4rem; }
  .size-full { width: 100%; height: 100%; }
  .overflow-visible { overflow: visible; }
  @media (prefers-reduced-motion: no-preference) {
    .motion-safe\\:animate-turn { animation: turn ${tokenIn(theme, 'duration-turn')} linear infinite; }
  }
  @keyframes turn { to { transform: rotate(360deg); } }
}`
}
