import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AppIcon, type AppIconChannel } from './app-icon.ts'

/**
 * The icon's own door (`@hemera/ui/app-icon`), for the tool that draws the packaged icons: the
 * component rendered once, on Node, to the standalone SVG a rasteriser reads.
 */
export {
  APP_ICON_TONES,
  AppIcon,
  drawingFor,
  type AppIconChannel,
  type IconDrawing,
} from './app-icon.ts'
/** How the test that keeps the icon's colours on the theme reads the theme. */
export { roleIn } from '../../tokens.ts'

/** The icon of a channel at a size, as the text of a standalone SVG file. */
export function appIconMarkup(channel: AppIconChannel, size: number): string {
  return renderToStaticMarkup(createElement(AppIcon, { channel, size }))
}
