import { expect, waitFor } from 'storybook/test'

/**
 * Waits for what a choice brought in to have arrived (issue #183): drawn in the room that grows
 * and fades it in, and faded all the way in. Something drawn outside such a room appeared at once,
 * which is what the check is there to refuse.
 */
export async function arrived(element: HTMLElement): Promise<void> {
  const room = element.closest('[data-reveal]')
  expect(room, 'it appeared at once, outside a room that brings it in').not.toBeNull()
  await waitFor(() => {
    expect(getComputedStyle(room!).filter).toBe('opacity(1)')
  })
}
