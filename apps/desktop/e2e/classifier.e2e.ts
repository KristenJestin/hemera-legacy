/** The application-wide classifier choice survives a window reload (issue #59). */

import { $$, browser, expect } from '@wdio/globals'

import { openSettings, pressTab } from './hand.ts'

async function classifierChoice(label: string) {
  const choices = await $$('[role="radiogroup"][aria-label="Permission classifier"] [role="radio"]')
  for (const choice of choices) {
    // oxlint-disable-next-line no-await-in-loop -- inspect the few visible choices in order
    if ((await choice.getText()).includes(label)) return choice
  }
  throw new Error(`No classifier choice named ${label}`)
}

describe('One classifier choice belongs to the application', () => {
  it('keeps Hemera Auto after a reload and exposes Jev settings', async () => {
    await openSettings()
    await pressTab('Hemera Auto')
    const auto = await classifierChoice('Hemera Auto')
    await auto.click()
    await browser.waitUntil(async () => (await auto.getAttribute('aria-checked')) === 'true')
    expect(await auto.getAttribute('aria-checked')).toBe('true')
    expect(await browser.$('input[name="jev-api-key"]').isDisplayed()).toBe(true)

    await browser.refresh()
    await openSettings()
    await pressTab('Hemera Auto')
    const restored = await classifierChoice('Hemera Auto')
    expect(await restored.getAttribute('aria-checked')).toBe('true')
    expect(await browser.$('input[name="jev-api-key"]').isDisplayed()).toBe(true)

    const fallback = await classifierChoice('Agent default')
    await fallback.click()
    await browser.waitUntil(async () => (await fallback.getAttribute('aria-checked')) === 'true')
    expect(await fallback.getAttribute('aria-checked')).toBe('true')
  })
})
