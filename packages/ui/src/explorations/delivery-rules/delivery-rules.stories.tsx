import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'

import { emulateReducedMotion } from '../../../.storybook/reduced-motion.ts'
import { HeldDelivery } from './delivery-run.tsx'
import {
  type CliState,
  type DeliveryRules,
  type DeliveryRun,
  RULES,
  RULES_PLAIN,
  RUN_CHANGES,
  RUN_DELIVERED,
  RUN_FAILED,
  RUN_NEEDS_YOU,
  RUN_NOTHING,
  RUN_RELEASE,
  RUN_RUNNING,
  RUN_START,
  atlasRun,
  configOf,
} from './model.ts'
import { SettingsPage } from './parts.tsx'
import { RulesEditor } from './rules-editor.tsx'
import type { Editing } from './step-dialog.tsx'

/**
 * Delivery rules per Project, and the end of a build Session (design exploration of 30 September
 * and 1 October 2026, issues #76, #288 and #290). Storybook only: nothing here is wired, and no
 * component of the design system changed for it.
 *
 * Rules · — Project settings, Delivery. A preset sets the Project's base; the table reads the base
 * down its first column and each repository across, in delivery order. A cell is where the step
 * stands there: ✓ as the base, a dot and its own value when changed, a dashed circle when left
 * out, + for a step of its own. A repository's head has a dot when it changes anything, and the
 * repository it delivers after.
 *
 * End · — the build Session once its result is accepted, in the window: the head line holds what
 * is being waited on (CI, a review, a release), the thread what happened, the notices pill what
 * needs you (a click, a confirmation, a refusal, a signed-out forge, then Close and Clean up), and
 * the build panel the delivery's view, each repository in delivery order.
 */

const meta = {
  title: 'Explorations/Delivery rules',
  tags: ['autodocs', 'new'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '52rem' } },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

// ——— The rules, in the Project settings ———

/** The Delivery section of a Project, held so that everything changed lands. */
function HeldRules({
  rules: start,
  cli = 'ready',
  dialogOn,
}: {
  rules: DeliveryRules
  cli?: CliState
  dialogOn?: Editing
}) {
  const [rules, setRules] = useState(start)
  return (
    <SettingsPage>
      <RulesEditor
        rules={rules}
        cli={cli}
        onChange={(next) => setRules((was) => ({ ...was, ...next }))}
        dialogOn={dialogOn}
      />
    </SettingsPage>
  )
}

function settings(
  name: string,
  description: string,
  props: Parameters<typeof HeldRules>[0],
): Story {
  return {
    name,
    render: () => <HeldRules {...props} />,
    parameters: { docs: { description: { story: description } } },
  }
}

export const RulesBase = settings(
  'Rules · Base only',
  'Merge chosen, no repository changes anything: every cell is ✓.',
  { rules: RULES_PLAIN },
)

export const RulesPerRepository = settings(
  'Rules · Per repository',
  'The kit pulls into main, adds a changeset and a release job by hand; the front comes after the kit, waits for its version, bumps it, adds screenshots and wants two approvals; the docs leave CI and review out.',
  { rules: RULES },
)

RulesPerRepository.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('button', { name: 'front: Review, changed' })).toBeVisible()
  await expect(canvas.getByRole('button', { name: 'docs: CI, left out' })).toBeVisible()
  await expect(canvas.getByRole('button', { name: 'api: Push, as the base' })).toBeVisible()
  await expect(canvas.getByRole('img', { name: 'After kit' })).toBeVisible()
}

const FRONT_REVIEW: Editing = {
  scope: 'front',
  step: {
    id: 'review',
    mode: 'auto',
    config: { kind: 'review', reviewers: ['@acme/web', '@acme/design'], approvals: 2 },
  },
  added: false,
  base: { id: 'review', mode: 'auto', config: configOf('review') },
  after: null,
}

export const RulesChangedStep = settings(
  'Rules · The front’s review',
  'A base step opened on one repository: what differs from the base has a dot, and the way back.',
  { rules: RULES, dialogOn: FRONT_REVIEW },
)

export const RulesOwnStep = settings(
  'Rules · The front’s release',
  'A step of the front’s own: wait for the kit’s version on the registry, a tag, or your word.',
  {
    rules: RULES,
    dialogOn: {
      scope: 'front',
      step: { id: 'release', mode: 'auto', config: configOf('release') },
      added: false,
      base: null,
      after: null,
    },
  },
)

export const RulesAddStep = settings(
  'Rules · Add a step for the front',
  'A new step for one repository: its kind, how it starts, after which step, and its fields.',
  {
    rules: RULES,
    dialogOn: {
      scope: 'front',
      step: { id: 'front-new', mode: 'auto', config: configOf('agent') },
      added: true,
      base: null,
      after: 'pull-request',
    },
  },
)

export const RulesSignedOut = settings(
  'Rules · gh signed out',
  'The forge’s command line is signed out: said once in the Forge card, with the command that fixes it.',
  { rules: RULES, cli: 'signed-out' },
)

// ——— The end of a build Session ———

function end(
  name: string,
  description: string,
  run: DeliveryRun,
  options: { noticesOpen?: boolean; live?: boolean; planOpen?: boolean } = {},
): Story {
  return {
    name,
    render: () => (
      <HeldDelivery
        run={run}
        live={options.live}
        noticesOpen={options.noticesOpen}
        rules={RULES}
        planOpen={options.planOpen}
      />
    ),
    parameters: { docs: { description: { story: description } } },
  }
}

export const EndPlan = end(
  'End · Plan',
  'Accept opens the plan over the Session: each repository in order, its steps, and this build’s pull request.',
  atlasRun(),
  { planOpen: true },
)

export const EndRunning = end(
  'End · Running',
  'The kit’s CI and the api’s review are live chips on the head line; the front waits for the kit.',
  RUN_RUNNING,
)

EndRunning.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const canvas = within(canvasElement)
  await expect(canvas.getByLabelText('kit: CI, 3 of 5')).toBeVisible()
  await expect(canvas.getByRole('region', { name: 'Delivery' })).toBeVisible()
}

export const EndRelease = end(
  'End · Waiting for the kit’s version',
  'The kit is merged; the front waits for @acme/kit to be published, then bumps it.',
  RUN_RELEASE,
)

export const EndNeedsYou = end(
  'End · Needs you',
  'The notices hold the kit’s release job, done by hand, and the api’s merge, on a click.',
  RUN_NEEDS_YOU,
  { noticesOpen: true },
)

export const EndRefused = end(
  'End · Push refused',
  'The api’s push is refused and gh is signed out: both in the notices, Git’s words in the thread and the panel.',
  RUN_FAILED,
  { noticesOpen: true },
)

EndRefused.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const page = within(canvasElement.ownerDocument.body)
  await expect(await page.findByRole('button', { name: 'Retry' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled()
  await expect(page.queryByRole('button', { name: 'Close' })).toBeNull()
}

export const EndChanges = end(
  'End · Changes requested',
  'The front’s review asks for changes: one dot per reviewer in the panel, and the request in the notices.',
  RUN_CHANGES,
  { noticesOpen: true },
)

export const EndDelivered = end(
  'End · Delivered',
  'Every step is done: Close and Clean up wait in the notices, each its own click.',
  RUN_DELIVERED,
  { noticesOpen: true },
)

EndDelivered.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const page = within(canvasElement.ownerDocument.body)
  await expect(await page.findByRole('button', { name: 'Close' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Clean up' })).toBeEnabled()
}

export const EndNothing = end(
  'End · Nothing',
  'A Project whose rules are nothing: the branch stays local, Close and Clean up are offered at once.',
  RUN_NOTHING,
  { noticesOpen: true },
)

export const EndLive = end(
  'End · Live',
  'Played through: answer the notices — Retry the api’s push, Merge the kit, confirm its release job — and the rest follows.',
  RUN_START,
  { live: true },
)
