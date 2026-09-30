/**
 * Who hears that a build changed: the window, which reads its view again (`build.changed`). Its
 * own file, so what changes a build without being the build — its review rounds (issue #278) —
 * tells the window through the same port.
 */

import { Context, Layer } from 'effect'

export interface BuildNoticesService {
  readonly changed: (sessionId: string) => void
}

export class BuildNotices extends Context.Service<BuildNotices, BuildNoticesService>()(
  'BuildNotices',
) {}

/** Nobody watching. */
export const NoBuildNotices = Layer.succeed(BuildNotices, { changed: () => undefined })
