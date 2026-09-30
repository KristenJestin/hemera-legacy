import { cn } from 'cn'
import { AnimatePresence, motion } from 'motion/react'
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react'

import { Disclosure } from '../../activity/disclosure.tsx'
import { Button, IconButton } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Face } from '../../components/face/face.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconAlertTriangle,
  IconBolt,
  IconBook,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconFileDiff,
  IconFilePlus,
  IconFolder,
  IconGitBranch,
  IconHandStop,
  IconLock,
  IconMessage,
  IconMessageQuestion,
  IconPackage,
  IconPaperclip,
  IconPlus,
  IconRefresh,
  IconShield,
  IconTrash,
  IconX,
} from '../../icons.ts'
import { collapse, expand, fold, useTransition } from '../../motion.ts'
import {
  type ChangeStatus,
  type ChangedFile,
  type DeliveryMode,
  type DeliveryStep,
  type Feedback,
  type FixGroup,
  type RepositoryResult,
  type ReviewResult,
  type Shot,
  type StaleFile,
  type Standing,
  countsOf,
} from './model.ts'

/*
 * The pieces every variant lays out its own way: the result per repository, the evidence, the
 * documentation, the feedback and its list, and the three gestures.
 */

/** The time of day of an ISO time, as the round says it. */
export function clock(at: string): string {
  return at.slice(11, 16)
}

/** What arrives or leaves, by its height, pushing what is under it. */
export function Fold({ children, className }: { children: ReactNode; className?: string }) {
  const transition = useTransition(fold)
  return (
    <motion.div
      className={cn('overflow-hidden', className)}
      initial={collapse}
      animate={expand}
      exit={collapse}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

const SECTION = 'flex min-w-0 flex-col gap-2'

const SECTION_HEAD = 'flex min-w-0 items-center gap-2 text-sm font-medium'

const QUIET = 'text-muted-foreground'

const MONO = 'font-mono text-xs'

/** A section of the result: its icon, its name, and what it holds. */
export function Section({
  icon,
  title,
  end,
  children,
}: {
  icon: ReactNode
  title: string
  end?: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <section aria-label={title} className={SECTION}>
      <h2 className={SECTION_HEAD}>
        <span aria-hidden="true" className="flex text-muted-foreground">
          {icon}
        </span>
        {title}
        {end !== undefined && <span className="ml-auto flex items-center gap-2">{end}</span>}
      </h2>
      {children}
    </section>
  )
}

/** An icon that says a state, named for whoever reads the page, and under the pointer. */
export function Mark({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}): ReactNode {
  return (
    <span role="img" aria-label={label} title={label} className={cn(MARK, className)}>
      {children}
    </span>
  )
}

const MARK = 'flex shrink-0'

/** The counts of a change: what a count of nothing would add, it leaves out. */
export function Counts({
  added,
  removed,
}: {
  added: number | null
  removed: number | null
}): ReactNode {
  if (added === null || removed === null) return <span className={cn(MONO, QUIET)}>bin</span>
  return (
    <span className={cn(MONO, 'flex shrink-0 items-center gap-1.5')}>
      {added > 0 && <span className="text-success-muted-foreground">{`+${String(added)}`}</span>}
      {removed > 0 && (
        <span className="text-destructive-muted-foreground">{`-${String(removed)}`}</span>
      )}
    </span>
  )
}

const STATUS_ICON: Record<ChangeStatus, { label: string; icon: ReactNode; tone: string }> = {
  A: { label: 'Added', icon: <IconFilePlus size="sm" />, tone: 'text-success-muted-foreground' },
  M: { label: 'Modified', icon: <IconFileDiff size="sm" />, tone: 'text-info-muted-foreground' },
  D: { label: 'Deleted', icon: <IconTrash size="sm" />, tone: 'text-destructive-muted-foreground' },
  R: { label: 'Renamed', icon: <IconFileDiff size="sm" />, tone: 'text-muted-foreground' },
}

const FILE_ROW = 'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm'

/** A path, its folder quiet and its name read first. */
export function PathName({ path }: { path: string }): ReactNode {
  const cut = path.lastIndexOf('/')
  const folder = cut < 0 ? '' : path.slice(0, cut + 1)
  const name = cut < 0 ? path : path.slice(cut + 1)
  return (
    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
      <span className={QUIET}>{folder}</span>
      <span className="text-foreground">{name}</span>
    </span>
  )
}

/** One changed file: its change as an icon, its path, its counts, and a dot if it went stale. */
export function FileRow({
  file,
  stale,
}: {
  file: ChangedFile
  stale?: StaleFile | undefined
}): ReactNode {
  const status = STATUS_ICON[file.status]
  return (
    <li className={FILE_ROW}>
      <Mark label={status.label} className={status.tone}>
        {status.icon}
      </Mark>
      <PathName path={file.path} />
      {stale !== undefined && <StaleMark file={stale} />}
      <Counts added={file.added} removed={file.removed} />
    </li>
  )
}

/** The warning that a file changed outside Hemera. */
function StaleMark({ file }: { file: StaleFile }): ReactNode {
  return (
    <Mark
      label={`Changed outside Hemera at ${clock(file.at)}`}
      className="text-warning-muted-foreground"
    >
      <IconAlertTriangle size="sm" />
    </Mark>
  )
}

/** A file Git does not track: the dashed circle, the path, no count. */
function UntrackedRow({ path }: { path: string }): ReactNode {
  return (
    <li className={FILE_ROW}>
      <Mark label="Untracked" className={QUIET}>
        <IconCircleDashed size="sm" />
      </Mark>
      <PathName path={path} />
    </li>
  )
}

const REPO = 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3'

const REPO_HEAD = 'flex min-w-0 items-center gap-2 text-sm'

/**
 * The result in one repository: its path, its branch and the commit the round stands on, then
 * the commits, the files and what Git does not track.
 */
export function RepositoryCard({
  repository,
  commitsOpen = false,
}: {
  repository: RepositoryResult
  commitsOpen?: boolean
}): ReactNode {
  const { added, removed } = countsOf(repository.files)
  const staleOf = (path: string) => repository.stale.find((one) => one.path === path)
  return (
    <article aria-label={repository.path} className={REPO}>
      <header className={REPO_HEAD}>
        <span aria-hidden="true" className="flex text-muted-foreground">
          <IconGitBranch size="sm" />
        </span>
        <span className="min-w-0 truncate font-mono text-sm font-medium">{repository.path}</span>
        <span className={cn(MONO, QUIET, 'min-w-0 truncate')}>{repository.branch}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {repository.stale.length > 0 && (
            <Mark label="Changed outside Hemera" className="text-warning-muted-foreground">
              <IconAlertTriangle size="sm" />
            </Mark>
          )}
          <Counts added={added} removed={removed} />
        </span>
      </header>
      <Disclosure
        defaultOpen={commitsOpen}
        summary={
          <span className="flex items-center gap-2 text-sm">
            <span className={QUIET}>{`Commits · ${String(repository.commits.length)}`}</span>
            <span className={cn(MONO, QUIET)}>{repository.head}</span>
          </span>
        }
      >
        <ol aria-label={`Commits of ${repository.path}`} className="flex flex-col gap-0.5">
          {repository.commits.map((commit) => (
            <li key={commit.sha} className="flex min-w-0 items-center gap-2 px-1.5 text-sm">
              <span className={cn(MONO, QUIET, 'shrink-0')}>{commit.sha}</span>
              <span className="min-w-0 truncate">{commit.subject}</span>
            </li>
          ))}
        </ol>
      </Disclosure>
      <ul aria-label={`Files of ${repository.path}`} className="flex flex-col">
        {repository.files.map((file) => (
          <FileRow key={file.path} file={file} stale={staleOf(file.path)} />
        ))}
        {repository.untracked.map((path) => (
          <UntrackedRow key={path} path={path} />
        ))}
      </ul>
    </article>
  )
}

/** A Project without Git: its folder, and the mark that says nothing of Git is presented. */
export function FolderCard({ folder }: { folder: string }): ReactNode {
  return (
    <article aria-label={folder} className={REPO}>
      <header className={REPO_HEAD}>
        <span aria-hidden="true" className="flex text-muted-foreground">
          <IconFolder size="sm" />
        </span>
        <span className="min-w-0 truncate font-mono text-sm font-medium">{folder}</span>
        <span className="ml-auto flex">
          <Mark label="No Git: no diff, no code review" className={QUIET}>
            <IconGitBranch size="sm" />
            <IconX size="sm" />
          </Mark>
        </span>
      </header>
    </article>
  )
}

/** The result: a card per repository, or the folder of a Project without Git. */
export function ResultCards({
  result,
  side = false,
}: {
  result: ReviewResult
  /** Whether the repositories stand side by side once the row is wide enough. */
  side?: boolean
}): ReactNode {
  return (
    <Section
      icon={result.git ? <IconGitBranch size="sm" /> : <IconFolder size="sm" />}
      title="Result"
    >
      <div
        className={
          side ? 'grid grid-cols-1 items-start gap-3 @3xl:grid-cols-2' : 'flex flex-col gap-2'
        }
      >
        {result.git ? (
          result.repositories.map((repository) => (
            <RepositoryCard key={repository.path} repository={repository} />
          ))
        ) : (
          <FolderCard folder={result.folder} />
        )}
      </div>
    </Section>
  )
}

const ROW = 'flex min-w-0 items-center gap-2 px-1.5 py-1 text-sm'

/** The evidence: the checks that passed, and what the reviewers found and the build fixed. */
export function Evidence({ result }: { result: ReviewResult }): ReactNode {
  return (
    <Section icon={<IconShield size="sm" />} title="Evidence">
      <ul aria-label="Checks passed" className="flex flex-col">
        {result.checks.map((check) => (
          <li key={check.id} className={ROW}>
            <StatusDot status="success" label="Passed" title={check.line} />
            <span className="font-medium">{check.name}</span>
            <span className={cn(MONO, QUIET, 'min-w-0 truncate')}>
              {check.place === '' ? 'Workspace root' : check.place}
            </span>
          </li>
        ))}
      </ul>
      {result.findings.length > 0 && (
        <ul aria-label="Findings fixed" className="flex flex-col gap-1">
          {result.findings.map((finding) => (
            <li key={finding.id} className="flex min-w-0 items-start gap-2 px-1.5 py-1 text-sm">
              <Mark label="Fixed" className="mt-0.5 text-success-muted-foreground">
                <IconCircleCheck size="sm" />
              </Mark>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{finding.reviewer}</span>
                <span className={QUIET}>{' · '}</span>
                {finding.text}
              </span>
              <span className={cn(MONO, QUIET, 'mt-0.5 shrink-0')}>{finding.fixedIn}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** The documentation: what each recipe changed, or why it changed nothing. */
export function Docs({ result }: { result: ReviewResult }): ReactNode {
  return (
    <Section icon={<IconBook size="sm" />} title="Documentation">
      <ul aria-label="Documentation" className="flex flex-col gap-1">
        {result.docs.map((doc) => (
          <li key={doc.id} className="flex min-w-0 flex-col gap-0.5 px-1.5 py-1">
            <span className="flex items-center gap-2 text-sm">
              <StatusDot
                status={doc.unchanged === null ? 'success' : 'cancelled'}
                label={doc.unchanged === null ? 'Changed' : 'Unchanged'}
              />
              <span className="font-medium">{doc.recipe}</span>
            </span>
            {doc.files.map((file) => (
              <span key={`${file.repository}/${file.path}`} className="flex min-w-0 pl-4">
                <PathName
                  path={file.repository === '' ? file.path : `${file.repository}/${file.path}`}
                />
              </span>
            ))}
            {doc.unchanged !== null && (
              <span className={cn('pl-4 text-sm', QUIET)}>{doc.unchanged}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

const STALE =
  'flex min-w-0 items-center gap-2 rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning-muted-foreground'

/** The result changed outside Hemera: which files, and taking the round again. */
export function StaleStrip({
  files,
  onRetake,
}: {
  files: readonly StaleFile[]
  onRetake: () => void
}): ReactNode {
  return (
    <div role="status" aria-label="Stale result" className={STALE}>
      <IconAlertTriangle size="sm" aria-hidden="true" />
      <span className="font-medium">Stale</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {files.map((file) => file.path).join(', ')}
      </span>
      <Button variant="secondary" size="sm" onClick={onRetake}>
        <IconRefresh size="sm" />
        Retake
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------
 * The feedback.
 * ------------------------------------------------------------------------------------------- */

const BOX = 'flex min-w-0 flex-col gap-2 rounded-lg border border-input bg-card p-2 focus-ring'

const TEXT =
  'field-sizing-content max-h-pinned min-h-16 w-full resize-none bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground'

const THUMB =
  'relative flex h-16 shrink-0 overflow-hidden rounded-md border border-border outline-none focus-ring'

/** The images of what was pasted or dropped, as screenshots to keep. */
function shotsOf(files: FileList | readonly File[]): Shot[] {
  return Array.from(files)
    .filter((file) => file.type.startsWith('image/'))
    .map((file) => ({
      id: `${file.name}-${String(file.lastModified)}-${String(Math.random())}`,
      name: file.name === '' ? 'pasted.png' : file.name,
      src: URL.createObjectURL(file),
    }))
}

/**
 * Where a feedback is written: a text, and the screenshots pasted into it or dropped on it. It
 * adds to the list and starts nothing.
 */
export function FeedbackBox({
  onAdd,
  disabled = false,
  defaultText = '',
  defaultShots = [],
}: {
  onAdd: (text: string, shots: Shot[]) => void
  disabled?: boolean
  defaultText?: string
  defaultShots?: Shot[]
}): ReactNode {
  const [text, setText] = useState(defaultText)
  const [shots, setShots] = useState<Shot[]>(defaultShots)
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const id = useId()
  const empty = text.trim() === '' && shots.length === 0

  function add(): void {
    if (empty || disabled) return
    onAdd(text.trim(), shots)
    setText('')
    setShots([])
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const pasted = shotsOf(event.clipboardData.files)
    if (pasted.length === 0) return
    event.preventDefault()
    setShots((was) => [...was, ...pasted])
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setOver(false)
    setShots((was) => [...was, ...shotsOf(event.dataTransfer.files)])
  }

  function key(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      add()
    }
  }

  return (
    <div
      role="group"
      aria-label="New feedback"
      className={cn(BOX, over && 'border-primary')}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <label htmlFor={id} className="sr-only">
        Feedback
      </label>
      <textarea
        id={id}
        className={TEXT}
        rows={2}
        value={text}
        disabled={disabled}
        placeholder="A remark, a question, a screenshot…"
        onChange={(event) => setText(event.target.value)}
        onPaste={paste}
        onKeyDown={key}
      />
      <AnimatePresence initial={false}>
        {shots.length > 0 && (
          <Fold key="shots">
            <ul aria-label="Screenshots to attach" className="flex flex-wrap gap-2 p-0.5">
              {shots.map((shot) => (
                <li key={shot.id} className={THUMB}>
                  <img src={shot.src} alt={shot.name} className="h-full w-auto" />
                  <span className="absolute top-0.5 right-0.5 flex">
                    <IconButton
                      variant="secondary"
                      size="sm"
                      icon={<IconX size="sm" />}
                      aria-label={`Remove ${shot.name}`}
                      onClick={() => setShots((was) => was.filter((one) => one.id !== shot.id))}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-1">
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            if (event.target.files !== null) {
              const picked = shotsOf(event.target.files)
              setShots((was) => [...was, ...picked])
            }
            event.target.value = ''
          }}
        />
        <Tooltip label="Attach a screenshot">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconPaperclip size="sm" />}
            aria-label="Attach a screenshot"
            disabled={disabled}
            onClick={() => picker.current?.click()}
          />
        </Tooltip>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={empty || disabled}
          onClick={add}
        >
          <IconPlus size="sm" />
          Add
        </Button>
      </div>
    </div>
  )
}

const ITEM = 'flex min-w-0 items-start gap-2 py-2'

const ANSWER = 'flex min-w-0 items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-sm'

/** A screenshot of a feedback, opened at its size by a press. */
function ShotThumb({ shot }: { shot: Shot }): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={THUMB}
        aria-label={`Open ${shot.name}`}
        onClick={() => setOpen(true)}
      >
        <img src={shot.src} alt="" className="h-full w-auto" />
      </button>
      <Dialog title={shot.name} size="wide" open={open} onOpenChange={setOpen}>
        <img src={shot.src} alt={shot.name} className="w-full rounded-md border border-border" />
      </Dialog>
    </>
  )
}

/** One feedback: its mark, its words, its screenshots, and the answer to a question. */
function FeedbackItem({
  feedback,
  index,
  locked,
  onRemove,
}: {
  feedback: Feedback
  index: number
  locked: boolean
  onRemove: () => void
}): ReactNode {
  const label = feedback.question ? 'Question' : 'Remark'
  return (
    <div className={ITEM}>
      <Mark
        label={label}
        className={cn('mt-0.5', feedback.question ? 'text-info-muted-foreground' : QUIET)}
      >
        {feedback.question ? <IconMessageQuestion size="sm" /> : <IconMessage size="sm" />}
      </Mark>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm">
          <span className={cn(MONO, QUIET)}>{`${String(index + 1)} `}</span>
          {feedback.text}
        </p>
        {feedback.shots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feedback.shots.map((shot) => (
              <ShotThumb key={shot.id} shot={shot} />
            ))}
          </div>
        )}
        {feedback.question && (
          <div className={ANSWER}>
            <Face
              state={feedback.answer === null ? 'thinking' : 'done'}
              size="icon"
              seed={7}
              label="The agent"
            />
            {feedback.answer === null ? (
              <StatusDot status="running" label="Being answered" />
            ) : (
              <span className="min-w-0">{feedback.answer}</span>
            )}
          </div>
        )}
      </div>
      {!locked && (
        <Tooltip label="Remove">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconX size="sm" />}
            aria-label={`Remove feedback ${String(index + 1)}`}
            onClick={onRemove}
          />
        </Tooltip>
      )}
    </div>
  )
}

/** The feedback of the round, in the order it was left; each arrives and leaves by its height. */
export function FeedbackList({
  feedback,
  locked = false,
  onRemove,
}: {
  feedback: readonly Feedback[]
  locked?: boolean
  onRemove: (id: string) => void
}): ReactNode {
  const transition = useTransition(fold)
  return (
    <ol aria-label="Feedback" className="flex flex-col divide-y divide-border">
      <AnimatePresence initial={false}>
        {feedback.map((one, index) => (
          <motion.li
            key={one.id}
            className="overflow-hidden"
            initial={collapse}
            animate={expand}
            exit={collapse}
            transition={transition}
          >
            <FeedbackItem
              feedback={one}
              index={index}
              locked={locked}
              onRemove={() => onRemove(one.id)}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

/** The batches the main agent made of the feedback, each with the feedback it comes from. */
export function FixGroups({
  groups,
  feedback,
}: {
  groups: readonly FixGroup[]
  feedback: readonly Feedback[]
}): ReactNode {
  return (
    <ol aria-label="Fixes" className="flex flex-col gap-2">
      {groups.map((group) => (
        <li key={group.id} className="flex min-w-0 flex-col gap-1 rounded-md bg-muted px-2 py-1.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <StatusDot status="running" label="Fixing" />
            {group.title}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 pl-4">
            {group.sources.map((source) => {
              const index = feedback.findIndex((one) => one.id === source)
              return (
                <span key={source} className={cn(MONO, QUIET, 'flex items-center gap-1')}>
                  <IconMessage size="sm" aria-hidden="true" />
                  {String(index + 1)}
                </span>
              )
            })}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** "Fix these": the one press that hands the accumulated feedback to the main agent. */
export function FixThese({
  count,
  fixing,
  onFix,
}: {
  count: number
  fixing: boolean
  onFix: () => void
}): ReactNode {
  if (fixing) {
    return (
      <span className="flex items-center gap-2 text-sm font-medium">
        <StatusDot status="running" />
        Fixing
      </span>
    )
  }
  return (
    <Button variant="primary" size="sm" disabled={count === 0} onClick={onFix}>
      <IconBolt size="sm" />
      {`Fix these · ${String(count)}`}
    </Button>
  )
}

/* ---------------------------------------------------------------------------------------------
 * The three gestures.
 * ------------------------------------------------------------------------------------------- */

const MODE: Record<DeliveryMode, { label: string; icon: ReactNode; tone: string }> = {
  automatic: { label: 'Automatic', icon: <IconBolt size="sm" />, tone: 'text-foreground' },
  confirm: {
    label: 'On your confirmation',
    icon: <IconHandStop size="sm" />,
    tone: 'text-warning-muted-foreground',
  },
  off: { label: 'Off', icon: <IconX size="sm" />, tone: 'text-muted-foreground' },
}

const STEPS = 'flex w-menu-panel flex-col gap-1'

const DONE_GESTURE = 'flex h-control-sm items-center gap-1.5 px-2 text-sm font-medium'

/** A gesture already made: its check, and its name. */
function Made({ label }: { label: string }): ReactNode {
  return (
    <span className={cn(DONE_GESTURE, 'text-success-muted-foreground')}>
      <IconCircleCheck size="sm" aria-hidden="true" />
      {label}
    </span>
  )
}

/**
 * Accept, Deliver, Close the Spec: three human acts, each a click, in the order they come. The
 * next one waits for the one before; the one made stays said. Deliver shows what the Project's
 * rules will do before it is confirmed; Close says what stays.
 */
export function Gestures({
  specKey,
  standing,
  delivery,
  acceptRefused,
  onAccept,
  onDeliver,
  onClose,
}: {
  specKey: string
  standing: Standing
  delivery: readonly DeliveryStep[]
  /** Whether Accept is refused right now: a stale result, a fix pass running. */
  acceptRefused: boolean
  onAccept: () => void
  onDeliver: () => void
  onClose: () => void
}): ReactNode {
  const [delivering, setDelivering] = useState(false)
  const [closing, setClosing] = useState(false)
  const accepted = standing !== 'open'
  const delivered = standing === 'delivered' || standing === 'closed'
  return (
    <div role="group" aria-label="Gestures" className="flex shrink-0 items-center gap-1.5">
      {accepted ? (
        <Made label="Accepted" />
      ) : (
        <Button variant="primary" size="sm" disabled={acceptRefused} onClick={onAccept}>
          <IconCheck size="sm" />
          Accept
        </Button>
      )}
      {delivered ? (
        <Made label="Delivered" />
      ) : (
        <Popover
          title="Delivery"
          side="bottom"
          align="end"
          open={delivering}
          onOpenChange={setDelivering}
          trigger={
            <Button variant={accepted ? 'primary' : 'secondary'} size="sm" disabled={!accepted}>
              <IconPackage size="sm" />
              Deliver
            </Button>
          }
        >
          <div className={STEPS}>
            <ul aria-label="The Project's delivery rules" className="flex flex-col">
              {delivery.map((step) => (
                <li key={step.id} className={ROW}>
                  <Mark label={MODE[step.mode].label} className={MODE[step.mode].tone}>
                    {MODE[step.mode].icon}
                  </Mark>
                  <span className={step.mode === 'off' ? QUIET : undefined}>{step.label}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="primary"
              size="sm"
              className="self-end"
              onClick={() => {
                setDelivering(false)
                onDeliver()
              }}
            >
              <IconPackage size="sm" />
              Confirm delivery
            </Button>
          </div>
        </Popover>
      )}
      {standing === 'closed' ? (
        <Made label="Closed" />
      ) : (
        <Popover
          title={`Close ${specKey}`}
          side="bottom"
          align="end"
          open={closing}
          onOpenChange={setClosing}
          trigger={
            <Button variant={delivered ? 'primary' : 'secondary'} size="sm" disabled={!delivered}>
              <IconLock size="sm" />
              Close the Spec
            </Button>
          }
        >
          <div className={STEPS}>
            <ul aria-label="What closing keeps" className="flex flex-col">
              <li className={ROW}>
                <IconLock size="sm" aria-hidden="true" />
                {`${specKey} closed, readable`}
              </li>
              <li className={ROW}>
                <IconFolder size="sm" aria-hidden="true" />
                Workspace kept
              </li>
              <li className={ROW}>
                <IconMessage size="sm" aria-hidden="true" />
                Sessions kept
              </li>
            </ul>
            <Button
              variant="primary"
              size="sm"
              className="self-end"
              onClick={() => {
                setClosing(false)
                onClose()
              }}
            >
              <IconLock size="sm" />
              {`Close ${specKey}`}
            </Button>
          </div>
        </Popover>
      )}
    </div>
  )
}

const ROUND_LINE = 'flex min-w-0 items-center gap-2 text-sm'

/** Where the round stands: its number, and a dot — or the warning of a result gone stale. */
export function RoundState({
  round,
  stale,
  fixing,
  standing,
}: {
  round: number
  stale: boolean
  fixing: boolean
  standing: Standing
}): ReactNode {
  return (
    <span className={ROUND_LINE}>
      {stale ? (
        <Mark label="Stale" className="text-warning-muted-foreground">
          <IconAlertTriangle size="sm" />
        </Mark>
      ) : (
        <StatusDot
          status={fixing ? 'running' : standing === 'open' ? 'pending' : 'success'}
          label={fixing ? 'Fixing' : standing === 'open' ? 'Waiting for your review' : 'Accepted'}
        />
      )}
      <span className={QUIET}>{`Round ${String(round)}`}</span>
    </span>
  )
}
