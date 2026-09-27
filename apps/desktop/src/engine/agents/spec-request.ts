/**
 * The Home's `New Spec` (issues #128, #179): a Session that defines a Spec from its first turn.
 *
 * Hemera creates the draft Spec itself from the request, before the prompt goes out: its title is
 * the request's first line and its type `feature` until the user confirms it, and the Session is
 * `define`, its writer (D7-07). Asking the agent to propose one left it free to explore and ask
 * in plain text first (#179); a Spec the engine creates cannot be skipped. The agent starts with
 * the define tools and the mission brief, and this request rides the same turn as a provision
 * behind Hemera's marker (D6-08), never as words of the user's.
 */

import { QUESTION_RULE, type SpecType, contextUri } from '@hemera/core'
import type { PromptIntent } from '@hemera/ipc'

import type { Provision } from './client.ts'

/** Where the brief is named, among what Hemera provides. */
export const SPEC_REQUEST_URI = contextUri('spec-request')

/** The type a Spec New Spec creates starts with, until the user confirms one. */
export const REQUESTED_TYPE: SpecType = 'feature'

/** How long the title taken from the request may be, cut on a word. */
const TITLE_CHARACTERS = 80

/** What the agent is asked, in the words it reads before the user's message. */
export const SPEC_REQUEST = `# Mission: the Spec of a New Spec

The user started this Session from Hemera's "New Spec": they want the message below to become a Spec. Hemera already created it as a draft, and this Session defines it: its title is the message's first line and its type \`${REQUESTED_TYPE}\` until the user confirms one.

- Settle the type first: ask the user, as a question card, whether it is a \`feature\`, a \`bug\` or a \`maintenance\`, with your recommendation. Read what you need to recommend one, and nothing more before asking.
- Once answered, write the type with \`spec_write\` and \`type\`, and give the Spec a short title with \`spec_write\` and \`title\`.
- Then work on the phase in focus, as your mission brief says. Do not change any code.
- ${QUESTION_RULE}`

/** The Spec a New Spec request creates: the first line of the request as its title. */
export function requestedSpec(text: string) {
  const line = text
    .split('\n')
    .map((one) => one.replace(/\s+/g, ' ').trim())
    .find((one) => one.length > 0)
  const title = line ?? 'New Spec'
  if (title.length <= TITLE_CHARACTERS) return { title, type: REQUESTED_TYPE }
  const cut = title.slice(0, TITLE_CHARACTERS)
  const space = cut.lastIndexOf(' ')
  return { title: `${space > 0 ? cut.slice(0, space) : cut}…`, type: REQUESTED_TYPE }
}

/** What a prompt sent with this intent carries in front of the user's text, if anything. */
export function provisionsOf(intent: PromptIntent | undefined): readonly Provision[] {
  if (intent !== 'spec') return []
  return [{ uri: SPEC_REQUEST_URI, text: SPEC_REQUEST, mimeType: 'text/markdown' }]
}
