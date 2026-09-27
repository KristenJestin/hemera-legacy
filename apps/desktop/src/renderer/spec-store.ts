import type {
  EngineEvent,
  JournalEntry,
  SpecLaunches,
  SpecRevision,
  SpecSnapshot,
  SpecType,
} from '@hemera/ipc'

/**
 * The Spec a `define` Session shows beside its chat (design D7-07, D7-10, D7-11, D7-12).
 *
 * Like every store of this window, it holds what the engine answered and nothing else: after
 * each act the Spec, its revisions and its Journal are read again
 * rather than patched here. The engine pushes `spec.changed` for every write, whoever made it —
 * the agent, another Session, an answer given in the chat — and the Spec on screen is read again
 * when it is about that one.
 *
 * The agent writes the Spec and the human reads it and answers: nothing here edits a section or a
 * story by hand (issue #135).
 */
export interface SpecState {
  /** The revision on screen, or null while no Spec is open. */
  snapshot: SpecSnapshot | null
  /** The current revision, the one shown or not: what the thread's questions are asked in. */
  current: SpecSnapshot | null
  /** The revision picked, or null for the current one. */
  revision: number | null
  /** Every revision of the open Spec, as the engine lists them. */
  revisions: SpecRevision[]
  /** The Spec's lines of the Journal, newest first: `spec.ready` says when a revision froze. */
  journal: JournalEntry[]
  /**
   * The Workspace the Spec is set on, the ones its build may be started in and the launch of that
   * build, read whole (D8-12, D8-13). Null until the Spec is open.
   */
  launches: SpecLaunches | null
  /** What the last act was refused with, in the engine's own words, or null. */
  refusal: string | null
  /**
   * What the last "Mark ready" was refused with, or null: said by the readiness bar it was
   * pressed on rather than under the thread, and forgotten with the next act that goes through or
   * once the Spec moves on from the content it was refused on.
   */
  readyRefused: string | null
  /**
   * What the last act on the build was refused with, said as a sentence — "The build could not be
   * asked for: the application did not answer in time." — or null. Kept for the build's actions,
   * where it was pressed, and forgotten with the next act on the build that goes through (#132).
   */
  buildRefused: string | null
  /**
   * New Spec's provisional Spec, by Session: the title its request gave it (issue #198). Saved
   * nowhere: the Spec exists once the user accepts the agent's proposal or continues the Spec it
   * pointed to, and until then this is all there is of it. It outlives the Spec on screen.
   */
  provisional: ReadonlyMap<string, string>
}

const EMPTY: SpecState = {
  snapshot: null,
  current: null,
  revision: null,
  revisions: [],
  journal: [],
  launches: null,
  refusal: null,
  readyRefused: null,
  buildRefused: null,
  provisional: new Map(),
}

/** How many lines of the Spec's Journal are read, which is the most one page may hold. */
const JOURNAL_PAGE = 200

const listeners = new Set<() => void>()

let state: SpecState = EMPTY
/** Which Spec is on screen, so an answer about another one is never put on this one. */
let shown: string | null = null

export function subscribeToSpec(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function specSnapshot(): SpecState {
  return state
}

function replace(next: SpecState): void {
  state = next
  for (const listener of listeners) listener()
}

/** What a refusal says, without the shape of whatever carried it. */
function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * How many reads of the Spec were started. Reads overlap — a write's own and the one its
 * `spec.changed` sets off — and answer in no set order: a read overtaken by a later one never
 * lands, so what is on screen is never older than what was read last.
 */
let started = 0

/**
 * The revision and content version the last refused "Mark ready" was read on once refused, or
 * null. The refusal is about that content: once the Spec moves on from it — the agent writes, a
 * Rework opens a new revision — it no longer says anything true, and is forgotten.
 */
let refusedOn: string | null = null

/** A Spec's current revision and content version, as one value to compare. */
function versionOf(current: SpecSnapshot | null): string | null {
  if (current === null) return null
  return `${current.spec.currentRevisionId}@${String(current.spec.contentVersion)}`
}

/** Reads the open Spec, its revisions and its Journal again. */
async function reload(specId: string): Promise<void> {
  started += 1
  const ticket = started
  const picked = state.revision
  const [current, revisions, launches] = await Promise.all([
    window.hemera.invoke('specs.read', { specId }),
    window.hemera.invoke('specs.revisions', { specId }),
    window.hemera.invoke('launches.forSpec', { specId }),
  ])
  const snapshot =
    picked === null || picked === current.revision.number
      ? current
      : await window.hemera.invoke('specs.read', { specId, revision: picked })
  const journal = await window.hemera.invoke('journal.read', {
    projectId: current.spec.projectId,
    specId,
    limit: JOURNAL_PAGE,
  })
  if (shown !== specId || ticket !== started) return
  replace({
    ...state,
    snapshot,
    current,
    revisions,
    // The read may answer nothing at all where nothing has been asked for: absent and null are
    // the same thing to the panel.
    launches: launches ?? null,
    journal: journal.entries,
    readyRefused:
      refusedOn !== null && refusedOn !== versionOf(current) ? null : state.readyRefused,
  })
}

/** Reads the open Spec again, keeping a failed read as the refusal on screen. */
async function refresh(specId: string): Promise<void> {
  try {
    await reload(specId)
  } catch (cause) {
    if (shown === specId) replace({ ...state, refusal: message(cause) })
  }
}

/** Runs an act on the open Spec, then reads it again; a refusal is kept as it was said. */
async function acting(act: (specId: string) => Promise<void>): Promise<boolean> {
  const specId = shown
  if (specId === null) return false
  try {
    await act(specId)
  } catch (cause) {
    replace({ ...state, refusal: message(cause) })
    await refresh(specId)
    return false
  }
  replace({ ...state, refusal: null, readyRefused: null })
  await refresh(specId)
  return true
}

/** Opens a Spec on its current revision; the same Spec is read again, not closed. */
export async function openSpec(specId: string): Promise<void> {
  if (shown !== specId) replace({ ...EMPTY, provisional: state.provisional })
  shown = specId
  await refresh(specId)
}

export function closeSpec(): void {
  shown = null
  replace({ ...EMPTY, provisional: state.provisional })
}

/** How long a provisional title may be, cut on a word. */
const PROVISIONAL_CHARACTERS = 80

/**
 * The title a provisional Spec takes from New Spec's request (issue #198): its first line, the
 * spaces folded, cut on a word when it is long.
 */
export function provisionalTitleOf(request: string): string {
  const line = request
    .split('\n')
    .map((one) => one.replace(/\s+/g, ' ').trim())
    .find((one) => one.length > 0)
  const title = line ?? 'New Spec'
  if (title.length <= PROVISIONAL_CHARACTERS) return title
  const cut = title.slice(0, PROVISIONAL_CHARACTERS)
  const space = cut.lastIndexOf(' ')
  return `${space > 0 ? cut.slice(0, space) : cut}…`
}

/**
 * New Spec, before the agent has said anything (issue #198): the Session shows a provisional
 * Spec titled with the request, which nothing saves.
 */
export function holdProvisionalSpec(sessionId: string, request: string): void {
  const provisional = new Map(state.provisional)
  provisional.set(sessionId, provisionalTitleOf(request))
  replace({ ...state, provisional })
}

/** The provisional Spec of a Session, by its title, or null when it has none. */
export function provisionalSpecOf(sessionId: string): string | null {
  return state.provisional.get(sessionId) ?? null
}

/** Lets go of a Session's provisional Spec: the real one took its place. */
function forgetProvisional(sessionId: string): void {
  if (!state.provisional.has(sessionId)) return
  const provisional = new Map(state.provisional)
  provisional.delete(sessionId)
  replace({ ...state, provisional })
}

/** Picks a revision to read: an older one is shown as it was frozen (D7-05). */
export async function selectRevision(revision: number | null): Promise<void> {
  const specId = shown
  if (specId === null) return
  replace({ ...state, revision })
  await refresh(specId)
}

/**
 * Accepts the agent's proposal: the Spec is created and this `free` Session becomes `define`,
 * its writer (D7-07). The Session changed with it, so whoever asked reads the Sessions again.
 */
export async function createSpec(
  sessionId: string,
  type: SpecType,
  title: string,
): Promise<boolean> {
  try {
    const made = await window.hemera.invoke('specs.create', { sessionId, type, title })
    await openSpec(made.snapshot.spec.id)
    // The provisional Spec became this one, in place (issue #198).
    forgetProvisional(sessionId)
    return true
  } catch (cause) {
    replace({ ...state, refusal: message(cause) })
    return false
  }
}

/**
 * Continues the existing Spec the agent pointed to (issue #198): its proposal accepted, this
 * `free` Session turns `define` on that Spec, and the panel shows it where the provisional Spec
 * was. No Spec is created.
 */
export async function joinSpec(sessionId: string, proposalId: string): Promise<boolean> {
  try {
    const joined = await window.hemera.invoke('specs.acceptExisting', { sessionId, proposalId })
    await openSpec(joined.snapshot.spec.id)
    forgetProvisional(sessionId)
    return true
  } catch (cause) {
    replace({ ...state, refusal: message(cause) })
    return false
  }
}

/**
 * Declines the agent's proposal (issue #130): the engine keeps it declined, the Session stays
 * `free`, and the agent is told. Answers what it was refused with, or null.
 */
export async function declineSpecProposal(
  sessionId: string,
  proposalId: string,
): Promise<string | null> {
  try {
    await window.hemera.invoke('specs.declineProposal', { sessionId, proposalId })
    return null
  } catch (cause) {
    return message(cause)
  }
}

/** Answers a question of the open Spec with one of its options or a text (D7-03). */
export async function answerQuestion(
  questionId: string,
  answer: { optionId?: string | undefined; text?: string | undefined },
): Promise<boolean> {
  return await acting(async (specId) => {
    await window.hemera.invoke('specs.answerQuestion', {
      specId,
      questionId,
      optionId: answer.optionId,
      text: answer.text,
    })
  })
}

/**
 * "Mark ready", made against the revision and the content version of the snapshot the
 * readiness was computed from, which is the one on screen (D7-10). A Spec that changed since
 * refuses it, and is read again; the refusal is kept for the readiness bar to say. The Session
 * is the one whose panel the click came from, which the Journal line names (D7-13).
 */
export async function markReady(sessionId: string): Promise<boolean> {
  const { snapshot } = state
  const specId = shown
  if (snapshot === null || specId === null) return false
  try {
    await window.hemera.invoke('specs.markReady', {
      specId,
      expectedRevisionId: snapshot.spec.currentRevisionId,
      expectedContentVersion: snapshot.spec.contentVersion,
      sessionId,
    })
  } catch (cause) {
    // Read again first: a Spec that changed as it was pressed is refused on what it is now.
    refusedOn = null
    replace({ ...state, readyRefused: message(cause) })
    await refresh(specId)
    refusedOn = versionOf(state.current)
    return false
  }
  replace({ ...state, refusal: null, readyRefused: null })
  await refresh(specId)
  return true
}

/**
 * "Rework" of a `ready` Spec: a new complete draft revision (D7-05). A reason left empty is
 * no reason, and is sent as none. The Session is named as for Mark ready.
 */
export async function rework(sessionId: string, reason: string): Promise<boolean> {
  const current = state.snapshot?.spec.currentRevisionId
  if (current === undefined) return false
  replace({ ...state, revision: null })
  const said = reason.trim()
  return await acting(async (specId) => {
    await window.hemera.invoke('specs.reopen', {
      specId,
      expectedRevisionId: current,
      reason: said === '' ? undefined : said,
      sessionId,
    })
  })
}

/** "Take over": the write right moves to this Session, at once (D7-11). */
export async function takeOver(sessionId: string): Promise<boolean> {
  return await acting(async (specId) => {
    await window.hemera.invoke('specs.transferWrite', { specId, sessionId })
  })
}

/**
 * Asks for a build in a Workspace the Project already has (D8-12): `main`, which every Project
 * has, or one made by hand. The launch waits for the Workspace to be ready, then starts the
 * agent in it (D8-13).
 */
export async function askForBuild(workspaceId: string): Promise<boolean> {
  return await building(ASK_REFUSED, async (specId) => {
    await window.hemera.invoke('launches.request', { specId, workspaceId })
  })
}

/**
 * Starts the build in the Workspace the Spec is set on (D8-12): the one thing left to press once
 * a preparation was made and no build was asked for.
 */
export async function startBuild(): Promise<boolean> {
  return await building(ASK_REFUSED, async (specId) => {
    await window.hemera.invoke('launches.start', { specId })
  })
}

/** Starts the agent again, after it refused to (D8-13). The launch is the one on screen. */
export async function retryBuild(): Promise<boolean> {
  const launchId = state.launches?.launch?.id
  if (launchId === undefined) return false
  return await building(RETRY_REFUSED, async () => {
    await window.hemera.invoke('launches.retry', { launchId })
  })
}

/**
 * Resumes the preparation of the Workspace the Spec is set on, after it failed (D8-05): what is
 * left of it runs in the engine, and the panel follows the Workspace through its `workspace`
 * event until it can start the build there.
 */
export async function resumeBuildWorkspace(): Promise<boolean> {
  const workspaceId = state.launches?.workspace?.id
  if (workspaceId === undefined) return false
  return await building(RESUME_REFUSED, async () => {
    await window.hemera.invoke('preparation.resume', { workspaceId })
  })
}

/** What a preparation that could not be resumed is said as, before the engine's own words. */
const RESUME_REFUSED = 'The preparation could not be resumed'

/** What a build that could not be asked for is said as, before the engine's own words. */
const ASK_REFUSED = 'The build could not be asked for'

/** What a build that could not be started again is said as, before the engine's own words. */
const RETRY_REFUSED = 'The build could not be started again'

/**
 * An act on the build: its refusal is a sentence kept apart from the page's own line (#132), and
 * the panel is read again either way — the launch says the rest through `launch.changed`.
 */
async function building(said: string, act: (specId: string) => Promise<void>): Promise<boolean> {
  const specId = shown
  if (specId === null) return false
  try {
    await act(specId)
  } catch (cause) {
    const reason = message(cause).replace(/\.$/, '')
    replace({ ...state, buildRefused: `${said}: ${reason}.` })
    await refresh(specId)
    return false
  }
  replace({ ...state, buildRefused: null })
  await refresh(specId)
  return true
}

export function forgetSpecRefusal(): void {
  if (state.refusal === null) return
  replace({ ...state, refusal: null })
}

/**
 * Listens for `spec.changed`, once for the whole window: the Spec on screen is read again when
 * it is the one that changed, and `changed` hears of every change with its Project — a Spec step
 * can change a Session too (its mission, its Spec, a new Session opened on it).
 *
 * The end of a turn is heard too: it is when the writer's agent was briefed, so an edit marked
 * "sent to the agent next turn" stops being one (Decided 17).
 */
export function listenToSpecs(changed: (projectId: string) => void): () => void {
  return window.hemera.on((event: EngineEvent) => {
    if (event.event === 'turn' && shown !== null) void refresh(shown)
    // The launch of the Spec on screen moved on: asked for, started, refused or taken back
    // (D8-13). Nothing else crosses — the panel reads the whole of it again, as it stands.
    if (event.event === 'launch.changed' && event.specId === shown) void refresh(event.specId)
    // The Workspace the Spec is set on moved on — resumed, ready, failed again — and what the
    // panel offers follows where it stands (D8-12).
    if (
      event.event === 'workspace' &&
      shown !== null &&
      event.workspaceId === state.launches?.workspace?.id
    ) {
      void refresh(shown)
    }
    if (event.event !== 'spec.changed') return
    changed(event.projectId)
    if (event.specId === shown) void refresh(event.specId)
  })
}
