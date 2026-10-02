import {
  type CodeViewItem,
  type FileContents,
  type SelectedLineRange,
  parseDiffFromFile,
} from '@pierre/diffs'
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewReactOptions,
  type DiffLineAnnotation,
  type LineAnnotation,
} from '@pierre/diffs/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronDown, IconChevronRight, IconCircleDashed, IconFileDiff } from '../../icons.ts'
import { instant, useTransition } from '../../motion.ts'
import { Arrive } from './arrive.tsx'
import { CommentBox } from './comment-box.tsx'
import { DIFF_THEME, useDocumentTheme } from './diff-theme.ts'
import { FeedbackNote } from './feedback-note.tsx'
import {
  type FeedbackAnchor,
  type FeedbackKind,
  type ReviewRound,
  type RoundFeedback,
  type RoundFile,
  inTreeOrder,
  linesOf,
  treePath,
} from './model.ts'

/**
 * The centre of the review: every file of the round, one after the other in one scroll, each its
 * diff, the way a pull request is read (the DiffsHub layout, drawn by `@pierre/diffs`'s CodeView).
 *
 * Split or stacked. Only what is on screen is drawn, line by line, so a round of thousands of
 * lines scrolls as one of ten. A generated file comes folded and opens from its head; a binary
 * file is its head and its sizes, with nothing to compare.
 *
 * A line number pressed, or dragged over for a range, or the `+` of the gutter, opens a box under
 * the last line: what is written there becomes a feedback of the round anchored on those lines —
 * the repository, the path, the lines and the side. The round's feedback on lines stands under
 * the lines it is about, and the list beside sends the reader to one of them.
 */

/** What a note under the lines is: a feedback of the round, or the box being written. */
type Note = { feedback: RoundFeedback; draft?: undefined } | { draft: true; feedback?: undefined }

/** The lines being commented on, in which file. */
interface Draft {
  id: string
  range: SelectedLineRange
}

/** What the reader asked to be shown: a file from the tree, or a feedback from the list. */
export type StageTarget =
  | { kind: 'file'; id: string; nonce: number }
  | { kind: 'feedback'; id: string; nonce: number }

export type DiffLayout = 'split' | 'stacked'

export interface DiffStageProps {
  round: ReviewRound
  feedback: readonly RoundFeedback[]
  layout: DiffLayout
  /** The feedback the list sent the reader to, lit while it is. */
  lit: string | null
  target: StageTarget | null
  /** Whether the round still takes feedback: an open round does, one being fixed does not. */
  writable: boolean
  onComment: (kind: FeedbackKind, body: string, anchor: FeedbackAnchor) => void
  onToggle: (id: string) => void
}

/** The file of an item, by its id. */
function fileIndex(round: ReviewRound): Map<string, { repository: string; file: RoundFile }> {
  const index = new Map<string, { repository: string; file: RoundFile }>()
  for (const repository of round.repositories) {
    for (const file of repository.files) {
      index.set(treePath(repository.name, file.path), { repository: repository.name, file })
    }
  }
  return index
}

/**
 * The diff of every text file, parsed once per round, and the bare head of every binary one:
 * CodeView keeps both by identity, and a new object under the same version is a file it refuses.
 */
function parsedDiffs(round: ReviewRound) {
  const diffs = new Map<string, ReturnType<typeof parseDiffFromFile>>()
  const heads = new Map<string, FileContents>()
  for (const repository of round.repositories) {
    for (const file of repository.files) {
      const name = file.path
      if (file.binary !== null) {
        heads.set(treePath(repository.name, file.path), { name, contents: '' })
        continue
      }
      diffs.set(
        treePath(repository.name, file.path),
        parseDiffFromFile(
          file.before === null ? null : { name, contents: file.before },
          file.after === null ? null : { name, contents: file.after },
        ),
      )
    }
  }
  return { diffs, heads }
}

/** The side of a diff a selection was made on, as the anchor says it. */
function sideOf(range: SelectedLineRange): 'old' | 'new' {
  return (range.endSide ?? range.side) === 'deletions' ? 'old' : 'new'
}

/** Where the lines of an anchor are drawn: their range on their side. */
function rangeOf(anchor: Extract<FeedbackAnchor, { kind: 'code' }>): SelectedLineRange | null {
  if (anchor.lines === null) return null
  const side = anchor.side === 'old' ? 'deletions' : 'additions'
  return { start: anchor.lines.start, end: anchor.lines.end, side, endSide: side }
}

/** What each expand button of the separators does, which the library leaves unsaid. */
const EXPANDERS: readonly (readonly [string, string])[] = [
  ['[data-expand-up]', 'Show the lines above'],
  ['[data-expand-down]', 'Show the lines below'],
  ['[data-expand-both]', 'Show the lines between'],
]

function nameExpanders(node: HTMLElement): void {
  const root = node.shadowRoot ?? node
  for (const [selector, name] of EXPANDERS) {
    for (const button of root.querySelectorAll(`[data-expand-button]${selector}`)) {
      button.setAttribute('aria-label', name)
    }
  }
}

/**
 * The scroll of the diff, which the keyboard has to reach to read it with the arrows: the library
 * leaves it out of the tab order.
 */
function reachable(element: HTMLDivElement | null): void {
  if (element === null) return
  element.tabIndex = 0
  element.setAttribute('role', 'region')
  element.setAttribute('aria-label', 'The diff of the round')
  element.classList.add('focus-ring')
}

/** Bytes as a reader reads them. */
function size(bytes: number | null): string {
  if (bytes === null) return '—'
  return bytes < 1024 ? `${String(bytes)} B` : `${(bytes / 1024).toFixed(1)} KB`
}

const HEAD_REPO = 'mr-1 rounded-sm bg-muted px-1 font-mono text-xs text-muted-foreground'

const HEAD_META = 'flex items-center gap-1.5 text-xs text-muted-foreground'

const NOTE_ROW = 'px-3 py-1.5 font-sans'

export function DiffStage({
  round,
  feedback,
  layout,
  lit,
  target,
  writable,
  onComment,
  onToggle,
}: DiffStageProps): ReactNode {
  const view = useRef<CodeViewHandle<Note, undefined>>(null)
  const theme = useDocumentTheme()
  const moving = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  // The lines under the hand, drawn selected while they are chosen and while their box is open.
  const [selection, setSelection] = useState<Draft | null>(null)
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  const files = useMemo(() => fileIndex(round), [round])
  const { diffs, heads } = useMemo(() => parsedDiffs(round), [round])
  // An item keeps its version while nothing of it changed, and takes a new one when its notes or
  // its fold did: CodeView redraws an item only when its version moves.
  const versions = useRef(new Map<string, { signature: string; version: number }>())

  const items = useMemo(() => {
    const list: CodeViewItem<Note>[] = []
    for (const repository of round.repositories) {
      const ordered = repository.files.toSorted((a, b) => inTreeOrder(a.path, b.path))
      for (const file of ordered) {
        const id = treePath(repository.name, file.path)
        const notes: DiffLineAnnotation<Note>[] = []
        for (const one of feedback) {
          const anchor = one.anchor
          if (anchor?.kind !== 'code' || anchor.lines === null) continue
          if (anchor.repository !== repository.name || anchor.path !== file.path) continue
          notes.push({
            side: anchor.side === 'old' ? 'deletions' : 'additions',
            lineNumber: anchor.lines.end,
            metadata: { feedback: one },
          })
        }
        if (draft?.id === id) {
          notes.push({
            side: draft.range.endSide ?? draft.range.side ?? 'additions',
            lineNumber: Math.max(draft.range.start, draft.range.end),
            metadata: { draft: true },
          })
        }
        const collapsed = file.binary !== null || (file.generated && !unfolded.has(id))
        const signature = JSON.stringify([
          notes.map((note) => [
            note.side,
            note.lineNumber,
            note.metadata.feedback?.id ?? 'draft',
            note.metadata.feedback?.withdrawnAt,
          ]),
          collapsed,
          lit,
        ])
        const known = versions.current.get(id)
        const version =
          known === undefined
            ? 0
            : known.signature === signature
              ? known.version
              : known.version + 1
        versions.current.set(id, { signature, version })
        const diff = diffs.get(id)
        const head = heads.get(id)
        if (diff === undefined) {
          if (head !== undefined)
            list.push({ id, type: 'file', file: head, collapsed: true, version })
          continue
        }
        list.push({ id, type: 'diff', fileDiff: diff, annotations: notes, collapsed, version })
      }
    }
    return list
  }, [round, diffs, heads, feedback, draft, unfolded, lit])

  const options = useMemo<CodeViewReactOptions<Note, undefined>>(
    () => ({
      theme: DIFF_THEME,
      themeType: theme,
      diffStyle: layout === 'split' ? 'split' : 'unified',
      diffIndicators: 'bars',
      lineDiffType: 'word-alt',
      hunkSeparators: 'line-info-basic',
      overflow: 'wrap',
      stickyHeaders: true,
      enableLineSelection: writable,
      enableGutterUtility: writable,
      lineHoverHighlight: 'number',
      layout: { paddingTop: 12, paddingBottom: 48, gap: 12 },
      // The library draws its expand buttons with no name: each is named here once drawn.
      onPostRender: (node, _instance, phase) => {
        if (phase !== 'unmount') nameExpanders(node)
      },
      onGutterUtilityClick: (range, context) => {
        setSelection({ id: context.item.id, range })
        setDraft({ id: context.item.id, range })
      },
      onLineSelectionEnd: (range, context) => {
        if (range !== null) setDraft({ id: context.item.id, range })
      },
    }),
    [theme, layout, writable],
  )

  // The reader sent here from the tree or the list: the file's head, or the lines of a feedback,
  // brought to the middle of the view.
  useEffect(() => {
    if (target === null) return
    const behavior = moving === instant ? 'instant' : 'smooth'
    if (target.kind === 'file') {
      view.current?.scrollTo({ type: 'item', id: target.id, align: 'start', behavior })
      return
    }
    const anchor = feedback.find((one) => one.id === target.id)?.anchor
    if (anchor?.kind !== 'code') return
    const id = treePath(anchor.repository, anchor.path)
    const range = rangeOf(anchor)
    if (range === null) {
      view.current?.scrollTo({ type: 'item', id, align: 'start', behavior })
      return
    }
    view.current?.scrollTo({ type: 'range', id, range, align: 'center', behavior })
  }, [target])

  function close(): void {
    setDraft(null)
    setSelection(null)
  }

  function annotationOf(annotation: LineAnnotation<Note> | DiffLineAnnotation<Note>): ReactNode {
    const { metadata } = annotation
    if (metadata.draft === true) {
      if (draft === null) return null
      const known = files.get(draft.id)
      if (known === undefined) return null
      const start = Math.min(draft.range.start, draft.range.end)
      const end = Math.max(draft.range.start, draft.range.end)
      const where = `${draft.id}:${linesOf({ start, end })}`
      return (
        <div className={NOTE_ROW}>
          <Arrive>
            <CommentBox
              label={`Comment on ${where}`}
              placeholder="Say what should change here…"
              autoFocus
              onCancel={close}
              onSubmit={(kind, body) => {
                onComment(kind, body, {
                  kind: 'code',
                  repository: known.repository,
                  path: known.file.path,
                  lines: { start, end },
                  side: sideOf(draft.range),
                })
                close()
              }}
            />
          </Arrive>
        </div>
      )
    }
    return (
      <div className={NOTE_ROW}>
        <FeedbackNote
          feedback={metadata.feedback}
          lit={lit === metadata.feedback.id}
          onToggle={writable ? onToggle : undefined}
        />
      </div>
    )
  }

  function prefix(item: CodeViewItem<Note>): ReactNode {
    const known = files.get(item.id)
    if (known === undefined) return null
    return <span className={HEAD_REPO}>{known.repository}</span>
  }

  function headEnd(item: CodeViewItem<Note>): ReactNode {
    const known = files.get(item.id)
    if (known === undefined) return null
    const { file } = known
    const open = unfolded.has(item.id)
    return (
      <span className={HEAD_META}>
        {file.untracked && (
          <span
            role="img"
            aria-label="Not tracked by Git"
            title="Not tracked by Git"
            className="flex"
          >
            <IconCircleDashed size="sm" aria-hidden="true" />
          </span>
        )}
        {file.binary !== null && (
          <span className="flex items-center gap-1">
            <IconFileDiff size="sm" aria-label="Binary" />
            {size(file.binary.before)} → {size(file.binary.after)}
          </span>
        )}
        {file.generated && (
          <Tooltip label={open ? 'Fold the generated file' : 'Open the generated file'}>
            <IconButton
              variant="ghost"
              size="sm"
              icon={open ? <IconChevronDown size="sm" /> : <IconChevronRight size="sm" />}
              aria-label={open ? 'Fold the generated file' : 'Open the generated file'}
              aria-expanded={open}
              onClick={() =>
                setUnfolded((was) => {
                  const next = new Set(was)
                  if (open) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })
              }
            />
          </Tooltip>
        )}
      </span>
    )
  }

  return (
    <div data-review-diff="" className="code-diff flex min-h-0 flex-1 flex-col">
      <CodeView<Note, undefined>
        ref={view}
        containerRef={reachable}
        items={items}
        options={options}
        className="min-h-0 flex-1 overflow-auto"
        selectedLines={selection}
        onSelectedLinesChange={setSelection}
        renderAnnotation={annotationOf}
        renderHeaderPrefix={prefix}
        renderHeaderMetadata={headEnd}
      />
    </div>
  )
}
