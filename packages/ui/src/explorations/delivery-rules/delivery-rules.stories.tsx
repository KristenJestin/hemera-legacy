import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'

import { emulateReducedMotion } from '../../../.storybook/reduced-motion.ts'
import { DeliverDialog, HeldDeliveryRun } from './delivery-run.tsx'
import {
  BITBUCKET_REPOSITORIES,
  type CliState,
  type DeliveryRules,
  type DeliveryRun,
  RULES,
  RUN_ASKS,
  RUN_DELIVERED,
  RUN_MISSING,
  RUN_NOTHING,
  RUN_REFUSED,
  RUN_REVIEW,
  RUN_RUNNING,
  RUN_SIGNED_OUT,
  atlasRun,
  stepsOf,
} from './model.ts'
import { SettingsPage } from './parts.tsx'
import { PolicyVariant } from './variant-policy.tsx'
import { PresetsVariant } from './variant-presets.tsx'
import { StepsVariant } from './variant-steps.tsx'

/**
 * Delivery rules per Project (design exploration of 30 September 2026, issue #76). Storybook only:
 * nothing here is wired, and no component of the design system changed for it.
 *
 * Delivery is set per Project the way the creation of a Workspace is: a forge and a remote per
 * repository, then an ordered list of steps — push, pull request, team review, merge — each
 * starting by itself or on a click, and the closure of the Spec and the cleanup of the Workspace
 * last, always on a click (core.md, "External actions and delivery"; D8-14). GitHub through `gh`,
 * Bitbucket through `bkt`; GitLab is listed and not offered yet. A push is Git's own; the three
 * other steps are the forge's command line.
 *
 * Three ways of setting the rules:
 *
 * - A · Policy — one choice among the five policies, the fields of the one chosen growing under
 *   it; one "starts" for every step.
 * - B · Steps — the ordered list of the preparation: a row per step read as a sentence, its mark
 *   for how it starts, moved, edited in one dialog.
 * - C · Presets — the five policies as presets, and B's list folded under them; a list changed by
 *   hand is the sixth tile, Custom.
 *
 * Then the end of a build: Accept opens the plan of the delivery, as a Workspace's plan opens,
 * with this build's pull request filled from the templates; the steps run in order, repository by
 * repository, each with its dot. A refused push keeps Git's own words and offers Retry; the pull
 * request shows its link and a dot per reviewer. A forge command line that is missing or signed
 * out is said once, over the steps it holds, with the one way to fix it.
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

type Variant = 'policy' | 'steps' | 'presets'

/** The Delivery section of a Project, held so that everything changed lands. */
function HeldSettings({
  variant,
  rules: start,
  cli = 'ready',
  stepsOpen,
  dialogOn,
}: {
  variant: Variant
  rules: DeliveryRules
  cli?: CliState
  stepsOpen?: boolean
  dialogOn?: string
}) {
  const [rules, setRules] = useState(start)
  const onChange = (next: Partial<DeliveryRules>) => setRules((was) => ({ ...was, ...next }))
  return (
    <SettingsPage>
      {variant === 'policy' && <PolicyVariant rules={rules} cli={cli} onChange={onChange} />}
      {variant === 'steps' && (
        <StepsVariant rules={rules} cli={cli} onChange={onChange} dialogOn={dialogOn} />
      )}
      {variant === 'presets' && (
        <PresetsVariant
          rules={rules}
          cli={cli}
          onChange={onChange}
          stepsOpen={stepsOpen}
          dialogOn={dialogOn}
        />
      )}
    </SettingsPage>
  )
}

function settings(
  name: string,
  description: string,
  props: Parameters<typeof HeldSettings>[0],
): Story {
  return {
    name,
    render: () => <HeldSettings {...props} />,
    parameters: { docs: { description: { story: description } } },
  }
}

// ——— The settings: three variants ———

export const PolicyReview = settings(
  'A · Policy',
  'A · Policy — one choice among five; the pull request and the review fields grow under it.',
  { variant: 'policy', rules: RULES },
)

export const PolicyMerge = settings(
  'A · Policy, merge',
  'A · Policy — Merge chosen: every field of the chain is open, the merge method last.',
  { variant: 'policy', rules: { ...RULES, steps: stepsOf('merge') } },
)

export const PolicyNothing = settings(
  'A · Policy, nothing',
  'A · Policy — Nothing: the fields fold away, the closure stays.',
  { variant: 'policy', rules: { ...RULES, steps: stepsOf('nothing') } },
)

export const Steps = settings(
  'B · Steps',
  'B · Steps — the ordered list of the preparation: push, pull request, review, each with how it starts.',
  { variant: 'steps', rules: RULES },
)

export const StepsDialog = settings(
  'B · Steps, dialog',
  'B · Steps — the dialog of a step: what it does, how it starts, and the fields of its kind.',
  { variant: 'steps', rules: RULES, dialogOn: 'pull-request' },
)

export const Presets = settings(
  'C · Presets',
  'C · Presets — one press for a policy, the steps it amounts to folded under it.',
  { variant: 'presets', rules: RULES },
)

export const PresetsOpen = settings(
  'C · Presets, steps open',
  'C · Presets — the steps unfolded: the same list as B.',
  { variant: 'presets', rules: RULES, stepsOpen: true },
)

export const PresetsCustom = settings(
  'C · Presets, custom',
  'C · Presets — a list changed by hand (no review, a merge on a click) is the sixth tile, Custom.',
  {
    variant: 'presets',
    rules: {
      ...RULES,
      steps: [
        { id: 'push', kind: 'push', mode: 'auto' },
        { id: 'pull-request', kind: 'pull-request', mode: 'auto' },
        { id: 'merge', kind: 'merge', mode: 'ask' },
      ],
    },
  },
)

export const SettingsSignedOut = settings(
  'Settings · gh signed out',
  'The forge command line is signed out: said once in the Forge card, with the command that fixes it.',
  { variant: 'presets', rules: RULES, cli: 'signed-out' },
)

export const SettingsMissing = settings(
  'Settings · gh missing',
  'The forge command line is not installed: said once, with where to get it.',
  { variant: 'presets', rules: RULES, cli: 'missing' },
)

export const SettingsBitbucket = settings(
  'Settings · Bitbucket',
  'A Project on Bitbucket with one repository, through `bkt`.',
  {
    variant: 'presets',
    rules: {
      ...RULES,
      forge: 'bitbucket',
      repositories: BITBUCKET_REPOSITORIES,
      base: 'main',
      reviewers: ['nadia'],
      approvals: 1,
      steps: stepsOf('pull-request'),
    },
  },
)

// ——— The end of a build ———

function end(name: string, description: string, run: DeliveryRun, live = false): Story {
  return {
    name,
    render: () => <HeldDeliveryRun run={run} live={live} />,
    parameters: { docs: { description: { story: description } } },
  }
}

function PlanOpen() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <HeldDeliveryRun run={atlasRun()} />
      <DeliverDialog open={open} onOpenChange={setOpen} rules={RULES} onDeliver={() => undefined} />
    </>
  )
}

export const EndPlan: Story = {
  name: 'End · Plan',
  render: () => <PlanOpen />,
  parameters: {
    docs: {
      description: {
        story:
          'Accept opens the plan: the branches, the steps with how each starts, and this build’s pull request filled from the templates.',
      },
    },
  },
}

export const EndRunning = end(
  'End · Running',
  'The api is pushed and its pull request is being opened; the rest waits.',
  RUN_RUNNING,
)

export const EndRefused = end(
  'End · Push refused',
  'The front’s push is refused: Git’s own words under the line, and Retry. The api goes on.',
  RUN_REFUSED,
)

EndRefused.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const canvas = within(canvasElement)
  await expect(canvas.getByText(/\[rejected\]/)).toBeVisible()
  await expect(canvas.getByRole('button', { name: /^Retry: push/ })).toBeEnabled()
  await expect(canvas.getByRole('button', { name: 'Close' })).toBeDisabled()
}

export const EndReview = end(
  'End · In review',
  'Both pull requests are open: a dot per reviewer; the front has changes requested.',
  RUN_REVIEW,
)

export const EndDelivered = end(
  'End · Delivered',
  'Every step is done: Close and Clean up are offered, each its own click.',
  RUN_DELIVERED,
)

EndDelivered.play = async ({ canvasElement }) => {
  await emulateReducedMotion()
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('button', { name: 'Close' })).toBeEnabled()
  await expect(canvas.getByRole('button', { name: 'Clean up' })).toBeEnabled()
}

export const EndClosed = end(
  'End · Closed',
  'The Spec closed and the Workspace cleaned up, each on its click.',
  { ...RUN_DELIVERED, closed: true, cleaned: true },
)

export const EndOnClick = end(
  'End · On a click',
  'A Bitbucket Project whose merge waits for a click: the pull request is open, Merge is offered.',
  RUN_ASKS,
)

export const EndNothing = end(
  'End · Nothing',
  'A Project whose policy is nothing: no step, the closure offered at once.',
  RUN_NOTHING,
)

export const EndSignedOut = end(
  'End · gh signed out',
  'gh is signed out: the pushes went through (Git), the forge steps wait; said once, with the fix.',
  RUN_SIGNED_OUT,
)

export const EndMissing = end(
  'End · gh missing',
  'gh is not installed: said once, with where to get it.',
  RUN_MISSING,
)

export const EndLive = end(
  'End · Live',
  'Played live: the api pushes and opens its pull request, the front’s push is refused; press Retry and the rest follows, reviews included.',
  atlasRun(),
  true,
)
