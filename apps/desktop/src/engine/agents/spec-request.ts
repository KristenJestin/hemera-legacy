/**
 * The Home's `New Spec` (issues #128, #179, #198): a Session whose first turn is about a Spec.
 *
 * No Spec is created for it (#198): one created before the agent spoke could be a second Spec for
 * something the Project already has, made without the user knowing. The window shows a provisional
 * Spec, saved nowhere, and the agent's first job is to check the Project's Specs, then either
 * propose a new one with a proper title and type or point to the one that exists. A new one is
 * created at once, as proposed: the user asked for it already (#205). The one that exists is the
 * user's to continue or not, in its card. Either way the agent is started again with the define
 * tools once the Session defines the Spec. This request rides the first turn as a provision behind Hemera's
 * marker (D6-08), never as words of the user's.
 */

import { QUESTION_RULE, contextUri } from '@hemera/core'
import type { PromptIntent } from '@hemera/ipc'

import type { Provision } from './client.ts'

/** Where the brief is named, among what Hemera provides. */
export const SPEC_REQUEST_URI = contextUri('spec-request')

/** What the agent is asked, in the words it reads before the user's message. */
export const SPEC_REQUEST = `# Mission: the Spec of a New Spec

The user started this Session from Hemera's "New Spec": they want the message below to become a Spec. No Spec exists for it yet: the user sees a provisional one, which nothing saves until you propose it.

- First, check the Project's Specs: \`project_get\` lists them, with their key, type, status and title.
- If one of them already covers what the user asks, point to it with \`spec_propose\` with kind \`existing\` and its key: the user continues it, or not.
- Otherwise, propose the new Spec with \`spec_propose\` with kind \`spec\`, a short title and its type, \`feature\`, \`bug\` or \`maintenance\`. Read what you need to choose them, and nothing more before proposing.
- A new Spec you propose is created at once, as you proposed it: the user already asked for one, and is not asked again. If you are unsure of its type, confirm it with the user through a question once you hold the Spec tools.
- A Spec you point to is the user's to continue, through its own card, never in the reply.
- Once this Session defines the Spec, end your turn: you are started again with the Spec tools and handed its mission brief. Do not change any code.
- ${QUESTION_RULE}`

/** What a prompt sent with this intent carries in front of the user's text, if anything. */
export function provisionsOf(intent: PromptIntent | undefined): readonly Provision[] {
  if (intent !== 'spec') return []
  return [{ uri: SPEC_REQUEST_URI, text: SPEC_REQUEST, mimeType: 'text/markdown' }]
}
