import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { HELPER_TONES, HelperAvatar } from './helper-avatar.tsx'

/**
 * What a helper wears (issue #77): a round avatar with its initial — two letters when another
 * helper of the Session shares it — in a colour of its own, read from its name, among the tinted
 * pairs of the theme that pass AA in both themes. A helper's definition may give its own.
 */

/** The four channels of a colour the browser computed, alpha last. */
function channelsOf(css: string): [number, number, number, number] {
  const [red = 0, green = 0, blue = 0, alpha = 1] = (css.match(/[\d.]+/g) ?? []).map(Number)
  return [red, green, blue, alpha]
}

/** What a colour that lets some of the page through is drawn as, over the page. */
function over(
  colour: [number, number, number, number],
  under: [number, number, number, number],
): [number, number, number, number] {
  const [red, green, blue, alpha] = colour
  return [
    red * alpha + under[0] * (1 - alpha),
    green * alpha + under[1] * (1 - alpha),
    blue * alpha + under[2] * (1 - alpha),
    1,
  ]
}

/** The first background up the page that lets nothing through. */
function pageUnder(element: Element): [number, number, number, number] {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const colour = channelsOf(getComputedStyle(at).backgroundColor)
    if (colour[3] === 1) return colour
  }
  return [255, 255, 255, 1]
}

function luminanceOf([red, green, blue]: [number, number, number, number]): number {
  const linear = (channel: number) => {
    const share = channel / 255
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

/** The contrast of an avatar's letters on its fill, as the eye gets it over the page. */
function contrastOf(avatar: Element): number {
  const page = pageUnder(avatar)
  const fill = over(channelsOf(getComputedStyle(avatar).backgroundColor), page)
  const ink = over(channelsOf(getComputedStyle(avatar).color), fill)
  const [light, dark] = [luminanceOf(fill), luminanceOf(ink)].toSorted((one, other) => other - one)
  return (light! + 0.05) / (dark! + 0.05)
}

const meta = {
  tags: ['autodocs'],
  title: 'Blocks/Session/HelperAvatar',
  component: HelperAvatar,
  args: { name: 'Reviewer', others: [] },
  argTypes: {
    name: { control: 'text', description: 'The helper’s name: its initial and its colour.' },
    others: {
      control: 'object',
      description: 'The other helpers of the Session, who decide whether one letter is enough.',
    },
    tone: {
      control: 'select',
      options: [undefined, ...HELPER_TONES],
      description: 'The colour its definition gives it, over the one read from its name.',
    },
  },
} satisfies Meta<typeof HelperAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

/** Alone with its initial, a helper wears one letter. */
export const Initial: Story = {
  render: (args) => (
    <span data-avatar>
      <HelperAvatar {...args} />
    </span>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-avatar]')).toHaveTextContent(/^R$/)
  },
}

/**
 * Two helpers that share an initial wear two letters each: the first two of a single word, the
 * first of each word otherwise, and the first letter that differs when those are shared too
 * (Reviewer and Researcher). One that shares it with no one keeps its one letter.
 */
export const SharedInitial: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const names = ['Reviewer', 'Researcher', 'Security reviewer', 'Scout', 'Documenter']
    return (
      <div className="flex items-center gap-2">
        {names.map((name) => (
          <span key={name} data-avatar={name}>
            <HelperAvatar name={name} others={names.filter((other) => other !== name)} />
          </span>
        ))}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const letters = [...canvasElement.querySelectorAll('[data-avatar]')].map(
      (one) => one.textContent,
    )
    await expect(letters).toEqual(['RV', 'RS', 'SR', 'SC', 'D'])
  },
}

/**
 * Every tone an avatar can wear, each a tinted fill and its own ink, and each read at AA or better
 * over the page, in this theme.
 */
export const Tones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-2">
      {HELPER_TONES.map((tone) => (
        <span key={tone} data-avatar={tone}>
          <HelperAvatar name="Reviewer" tone={tone} />
        </span>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const avatars = HELPER_TONES.map(
      (tone) => canvasElement.querySelector(`[data-avatar="${tone}"]`)!.firstElementChild!,
    )
    // As many fills as tones: two tones alike would be two helpers the eye cannot tell apart.
    await expect(
      new Set(avatars.map((avatar) => getComputedStyle(avatar).backgroundColor)).size,
    ).toBe(HELPER_TONES.length)
    await expect(avatars.filter((avatar) => contrastOf(avatar) < 4.5)).toEqual([])
  },
}

/** A name keeps its colour; a definition that gives one is worn instead. */
export const OwnTone: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-2">
      <span data-avatar="read">
        <HelperAvatar name="Reviewer" />
      </span>
      <span data-avatar="again">
        <HelperAvatar name="Reviewer" others={['Documenter', 'Scout']} />
      </span>
      <span data-avatar="given">
        <HelperAvatar name="Reviewer" tone="build" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fill = (which: string) =>
      getComputedStyle(canvasElement.querySelector(`[data-avatar="${which}"]`)!.firstElementChild!)
        .backgroundColor
    await expect(fill('again')).toBe(fill('read'))
    await expect(canvasElement.querySelector('[data-avatar="given"] > *')).toHaveClass(
      'bg-mission-build-muted',
    )
    // Decoration beside a name that is already said: nothing for a screen reader to read twice.
    await expect(canvas.queryAllByRole('img')).toEqual([])
  },
}
