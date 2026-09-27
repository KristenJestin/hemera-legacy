/**
 * The Home's `New Spec` (issues #128, #179, #198): a Session whose first turn is about a Spec.
 *
 * No Spec is created for it (#198): one created before the agent spoke could be a second Spec for
 * something the Project already has, made without the user knowing. The window shows a provisional
 * Spec, saved nowhere, and the agent's first job is to check the Project's Specs, then either
 * propose a new one with a proper title and type or point to the one that exists. The user's
 * answer to that card is what makes a Spec this Session defines, and the agent is started again
 * with the define tools then. This request rides the first turn as a provision behind Hemera's
 * marker (D6-08), never as words of the user's.
 */

import { QUESTION_RULE, contextUri } from '@hemera/core'
import type { PromptIntent } from '@hemera/ipc'

import type { Provision } from './client.ts'

/** Where the brief is named, among what Hemera provides. */
export const SPEC_REQUEST_URI = contextUri('spec-request')

/** What the agent is asked, in the words it reads before the user's message. */
export const SPEC_REQUEST = `# Mission: the Spec of a New Spec

The user started this Session from Hemera's "New Spec": they want the message below to become a Spec. No Spec exists for it yet: the user sees a provisional one, which nothing saves until they accept your proposal.

- First, check the Project's Specs: \`project_get\` lists them, with their key, type, status and title.
- If one of them already covers what the user asks, point to it with \`spec_propose\` with kind \`existing\` and its key: the user continues it, or not.
- Otherwise, propose the new Spec with \`spec_propose\` with kind \`spec\`, a short title and its type, \`feature\`, \`bug\` or \`maintenance\`. Read what you need to choose them, and nothing more before proposing.
- The proposal is your first question to the user: it is asked through its own card, never in the reply. Once they accept it, this Session defines the Spec and you are handed its mission brief. Do not change any code.
- ${QUESTION_RULE}`

/** What a prompt sent with this intent carries in front of the user's text, if anything. */
export function provisionsOf(intent: PromptIntent | undefined): readonly Provision[] {
  if (intent !== 'spec') return []
  return [{ uri: SPEC_REQUEST_URI, text: SPEC_REQUEST, mimeType: 'text/markdown' }]
}
