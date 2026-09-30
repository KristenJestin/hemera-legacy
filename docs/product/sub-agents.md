# Helper agents in a build (issue #77)

**Status:** a proposal written after the maintainer's decision of 30 September 2026 and its
addition the same day. Nothing here is implemented. Two things were decided: a build Session is an
orchestrator chat, and there are two kinds of helper agent. The points still open each recommend one
option, and the table at the end lists them. Once they are decided, they become the Design section
of issue #77, and `core.md` ("The `build` mission protocol") is edited in the same pull request as
the engine.

The Storybook exploration beside it is `Explorations/Orchestrator`
(`packages/ui/src/explorations/orchestrator/`).

## What was decided

**A build Session is an orchestrator chat.** The user only ever talks to the main agent. The main
agent launches helper agents to go faster, stops them, relaunches them, and handles their results.
The user never talks to a helper, and never to a task: feedback goes to the main agent, which
dispatches it as it sees fit.

**There are two kinds of helper agent, both in 0.5:**

- **Defined helpers** are written in advance, each with a known role: the reviewers of `review`
  (several specialities, each with a fresh context), the documenter of the build's documentation,
  and the prototyper of `define`'s `prototype` phase. Each has a name, an icon of its own, a
  description, what it receives, what it may do and what it returns. The main agent launches them
  by name.
- **Free helpers** have no type. The main agent launches them as it likes, mostly to run tasks in
  parallel, and writes their brief itself. They share one common icon.

**What the user sees:**

1. Helpers appear where commands already appear: as chips in the line of what goes on under the
   Session's head, next to the runs. A chip has the helper's icon and state dot. Its glance, on
   hover or press, says what the helper is doing and its last line, and its Details are the same
   dialog as for the other kinds (`GoingOnAgent` in `going-on.ts`).
2. A helper's session opens read-only. The user sees its whole thread live, as for any Session,
   with no composer and no way to answer. Its permission requests are answered by the main agent's
   policy or come to the user among the main Session's notices, never inside the helper's view.
3. A helper may launch its own helpers. The chips show who launched whom lightly, without turning
   the line into a tree.
4. The build view can be made big, with the chat folded or closed. The line and the notices pill
   stay reachable when the chat is closed: nothing important lives only in the chat.

**No per-task agent UI.** The build view keeps its stories and tasks. Which agent works on which
task is the main agent's business. At most, a task can show the icon of the helper currently on it.
The user has no "Stop this agent" or "Hand again" button. They stop the whole build, or tell the
main agent.

## What 5a gives, and where it stops

This lot builds on lot 5a as its code stands (`packages/core/src/domain/build.ts`,
`packages/core/src/protocols/build/`, `apps/desktop/src/engine/build/`):

- **The ready set is handed at once** (D10-03). `execute` composes one delivery with every ready
  task, and one snapshot of each repository opens one attempt per handed task.
- **A task's evidence is the diff of the whole Workspace.** With one agent that is exact. With two
  writing at once, T2's files would include T3's, and a check whose line takes `{files}` would run
  the other task's tests.
- **Every write goes through Hemera.** In bare mode an agent has no tools of its own. `fs_write`,
  `fs_edit` and `commands_run` are Hemera's, called with the Session they belong to
  (`tools/catalogue.ts`, `admitTool`), so Hemera can tell which agent wrote which file and can
  refuse a write. The exception is a command, which writes whatever it writes.
- **One live agent per Session.** The runtime and the pool (`agents/runtime.ts`, `agents/pool.ts`)
  key every agent, its thread, its tool token and its permissions by a Session id.
- **The internal delivery exists** (D7-14): `deliverInternal` queues a helper's result for the
  main agent's next safe point. It is held in memory, so a result caught by a quit is lost, while
  `core.md` asks for a durable inbox.
- **Pause** (D10-09) counts the Hemera calls running per Session. **Blockers** (D10-08) suspend a
  task and its dependants.

## 1. A helper is a child Session

A helper needs a thread (to be opened live and read afterwards), a tool token, a permission mode
and a place in the pool. Today all of these are keyed by a Session.

A helper is **a row of `sessions`** with `parent_session_id` (the Session that launched it: the
build Session, or another helper) and `helper` (the definition's id, or `null` for a free helper).
It is never listed in the sidebar and never searchable on its own. The runtime, the thread, the tool
token and the pool work as they are. The Session page opens it read-only: no composer, no Run, no
`…`. The only way out is back to its parent.

The same holds in `define`: the prototyper is a child Session of the `define` Session.

## 2. What the main agent does with helpers

The main agent gets three Hemera tools. The user gets none of them:

- `helper_launch({ helper?, brief, task?, inputs? })` launches a defined helper by name (`helper`),
  or a free one when `helper` is left out. `brief` is what the main agent wants it to know. `task`
  ties it to a build task, which gives it that task's claims and evidence (section 4). It returns
  the child Session's id at once and never waits for the helper to finish.
- `helper_stop({ id })` stops a helper at its next safe point. Its task, if it has one, stays
  `in_progress` with its try open and its claims kept.
- `helper_read({ id })` returns where a helper stands: its state, its last line, how long it has
  been silent, and its result once it has one. The main agent uses it on a helper that has gone
  quiet before deciding to stop and relaunch it.

A helper holds `helper_launch` too, for its own helpers. A helper's helper answers to it, not to the
main agent. **Depth is capped at two** (main → helper → helper), so a runaway chain cannot fill the
pool. A launch past the cap is refused with the reason.

**How many at once:** "Helpers at once", per Project, in the Build section of its settings. It
ranges from 1 to 6 and defaults to 3, counting every helper of the build at any depth. A launch
above the number is refused with the reason, never queued: the main agent decides what to do
instead, which is its job as orchestrator.

## 3. Defined helpers

### What a definition holds

| Field | What it is | Example (Test review) |
|---|---|---|
| `id` | stable, what the main agent names it by | `review-tests` |
| `name` | what the chip says | Test review |
| `icon` | an icon of the design system's helper family | `reviewer` |
| `description` | one sentence, shown in the catalogue and given to the main agent | Reads a finished task with a fresh context… |
| `where` | the protocols and phases it may be launched in | `build.review`, `build.execute` |
| `receives` | the brief's template and the inputs Hemera assembles | the task, its criteria, its files, its checks |
| `tools` | the Hemera tools it holds, and whether it may write | `fs_read`, `search`, `commands_run` (tests only); no write |
| `returns` | a schema of its result, which Hemera validates before the main agent reads it | `{ verdict, findings: [{ file, line, text }] }` |
| `context` | what it does **not** inherit | no main thread, no reasoning of the developer agents |

The first ones are the reviewers (at least tests, security and the Spec's contract), the documenter
and the prototyper. Specialities of one role share the role's icon and are named apart ("Test
review", "Security review").

### Where definitions live

- **A · Built-in data in the core protocol**, one file per helper
  (`packages/core/src/protocols/helpers/review-tests.ts`, …), each exporting a definition validated by
  one Zod schema (`helperDefinition`) in the same folder. The brief is composed by the protocol, as
  `composeBuildBrief` does today. The icons are in the design system (`icons.ts`), and the definition
  names its icon by key, so `core` imports nothing of `ui`. A unit test checks that every definition
  parses, that its tools exist in the catalogue, that its result schema is an object, and that its
  icon key is one the design system exports.
- **B · Files in the Project's repository** (`.hemera/helpers/*.md` with a front matter), read at
  launch.

**Recommended: A for 0.5.** The reviewers, the documenter and the prototyper are part of Hemera's
protocols. Their result shapes are read by Hemera itself (a review's findings become tasks, a
prototype's answer goes into the Spec), so their definitions have to change with the code that reads
them, in the same pull request. A schema in `core` keeps them honest, and one file each keeps them
readable in one place, as the maintainer asked.

**Projects adding their own: later, and yes, eventually**, as B, the way other agent tools read
agents and commands from the repository. A Project-defined helper would be restricted to what a
free helper can do (its result is free text for the main agent, not a shape Hemera acts on), and it
would take an icon from the helper family. It waits until the built-in ones have been used on real
builds. Recorded in `open-questions.md` when this is decided.

## 4. Parallel work: Hemera's safety net

Several helpers writing in one Workspace is **the main agent's problem to organise and Hemera's to
make safe**. None of this is a user-facing feature: the user sees the chips and the build view,
nothing else.

### 4.1 One Workspace, with file claims

Every helper tied to a task holds **claims**: the paths its task may write. They come from the
approach note of `prepare`, which ends with one line per task (`T2: src/billing/**,
src/ledger/export.ts`), and grow at a helper's first write to a free path.

- A write (`fs_write`, `fs_edit`) to a path claimed by another running helper is **refused at
  once**, naming the holder. It never waits, because two helpers waiting on each other's files
  would wait forever. The refusal is in the helper's thread, and in its result to the main agent.
- A command is not attributed by path. Hemera compares the Workspace before and after it (5a's
  snapshots): a file it changed that another helper claims gets a red check on that task's next
  try ("changed by another agent's command"). A manifest or a lockfile is claimed like any file,
  so two helpers never install dependencies at once.
- Reads are free.

The alternative, one Git worktree per helper merged back, costs the Project's preparation recipe
per helper (minutes, gigabytes, ports) and a merge path with its conflicts. It stays the answer if
claims prove too coarse on real builds.

### 4.2 A task's evidence

A try records the helper that made it. Its files are the diff of its snapshots **restricted to the
files it wrote through Hemera's tools and the files it claims**. `{files}` is expanded from that
list.

### 4.3 Provisional red checks

A `task` check runs in a Workspace that others may still be writing in, so a type check can be red
because of someone else's half-written file. **A red check is provisional while another helper is
in the middle of a try.** It runs again once none is, and only a red that still holds counts as a
try. A green is final at once. Without this, a task could burn its three tries on another task's
work in progress.

### 4.4 Red tries

A red verdict goes back to the helper that made the try, which still has the task in context. After
the third red try, the task is handed to the user, as in 5a.

## 5. What a helper receives, and what comes back

**Its brief** is composed by the protocol (`composeBuildBrief({ kind: 'helper' })`). A defined
helper's brief comes from its definition's template. A free helper's brief is the main agent's
`brief`, wrapped in a short helper mission: one piece of work, never the user, never another
Session, never a state of the build, no commit, no branch. A helper tied to a task also receives
the frozen Spec read-only, its task as `definition()` writes it, its claims, and on a relaunch its
task's tries and the "inspect the real state first" paragraph. It never receives the main thread.

**Its agent and model** are the main agent's own. The Project's "worker" model of 13 September is a
setting to add once a real build shows that a cheaper model does as well.

**Its result** reaches the launcher as an internal delivery: a defined helper's result validated
against its `returns` schema, and a free helper's summary. Both carry the writes it was refused.
The delivery is composed from rows (the try, its checks, the Journal line), so it is **durable**: a
restart composes it again instead of losing it, which is what `core.md` asks of the inbox.

**Its permissions** follow the build Session's mode. A request that the mode does not answer goes
**to the main Session's notices**, with the helper's icon and name in the row's place, and is
answered there. It never appears inside the helper's own view, which has nothing to answer with.

## 6. Stop, a crash, a stuck helper

- **Pause** stays one control for the whole build. Every agent (the main one and each helper)
  stops at its own safe point, and the build is paused once all of them are idle. **Resume** hands
  each helper that was interrupted its own resume brief.
- **Stop build** stops everything and closes the build, as today.
- **A crash** (the process exits, the provider refuses a call) ends the helper. Its task stays
  `in_progress` with its tries and claims, and the main agent is told. That is the issue's
  acceptance criterion.
- **A stuck helper** is one that has said nothing and called nothing for a while (5 minutes to
  start with). Hemera does not stop it. Its chip says so, and the main agent is told once. It is
  the main agent's call to `helper_read`, stop, and relaunch.

## 7. The build Session's layout

The exploration draws the real build Session in three layouts. All three share one change: **the
head goes across the whole page**, above the chat and the build, so the line (runs and helpers) is
always visible whatever the chat does.

**The helper chips** stand after the runs in `GoingOnLine`. Each chip has the helper's icon (the
definition's own, or the common free-helper icon), its dot, its name, and the task it is on. A
helper launched by another shares its launcher's outline, separated by a thin rule, and its glance
says "by T2". A stuck helper's dot stops breathing, and a clock beside its name says how long it
has been silent. The glance shows the helper's live face, its place, what it is doing and its last
line, with two actions: its session (the eye) and its Details (the ⓘ, the line's own dialog).

**The helper icons** are drawn from the Face, so they read as Hemera's family: the brand's tile and
the face's chevron eyes. Each departs from it by one nameable thing. The free helper has a second
tile behind it, the reviewer's eyes are a pair of glasses, the documenter's tile is a page with a
folded corner, and the prototyper's tile is dashed, like a sketch.

**A helper's session** opens in the build's place, on the stage, with a "Main Session" way back. It
has the helper's live face, icon, dot and place in its head, and its thread below, with no
composer. Its chip stays pressed while it is open.

**The three layouts:**

- **A · Strip.** The chat and the build side by side. The chat folds to a strip on the left and the
  build takes the width. The strip keeps the main agent's live face, whose tooltip is its last line,
  and a Write button that unfolds the chat with the caret in the box. Folded, the notices stand at
  the foot of the build. The width moves on `morph` and pushes the build. The chat is laid at its
  unfolded width and clipped, so its text never reflows. The notices rise at the foot once the fold
  has landed, and are never drawn twice.
- **B · Build and Chat.** Two full-width views and a switch at the start of the line. The composer
  is the page's foot under both views, with the notices on its edge. The views cross-fade in place.
- **C · Drawer.** The build is always the whole page, and the chat slides over it from the left.
  Closed, the foot holds a "Main agent" pill with its live face, which opens the drawer with the
  caret in the box, and the notices beside it.

**Recommended: A.** The build is big and the chat is one press away, where it was. The main agent's
face in the strip says what it is doing without unfolding anything. When unfolded, the main chat and
a helper's session can be read side by side, which neither B nor C allows. B hides the thread behind
a switch, and the Build and Chat views then compete for the same place. C covers the build while
the user writes, which is when they want to point at it.

## 8. Costs

Estimates, to be measured on the three real builds of the acceptance:

- **Tokens.** Each helper tied to a task reads its brief and the Spec, then the code of its task. A
  build with three helpers reads more in total than a 5a build, but each context stays small, and
  small contexts are what keep the long builds of 5a from degrading.
- **Time.** Independent tasks run at once, so a Spec of three independent tasks takes about the time
  of its longest task, plus the checks.
- **Processes.** Each helper is one ACP adapter process of a few hundred megabytes. It is let go as
  soon as its work settles.
- **Provider limits.** Four agents at once reach a rate limit sooner. A refused call is a crash of
  that helper (section 6), never of the build.
- **Engineering.** One migration (`sessions.parent_session_id` and `helper`, `build_claims`, the
  helper on `build_attempts`, "Helpers at once" on the Project), the three tools, the definitions
  and their schema, the write guard, the attribution of files, the provisional reds, the durable
  inbox, the helper chips, the read-only session, and the layout.

## Points to decide

| # | Point | Options | Recommended |
|---|---|---|---|
| 1 | Where definitions live | Built-in data in `core`, one file each, a schema · files in the repository | Built-in (A) |
| 2 | Projects' own helpers | Later, as repository files limited to a free helper's powers · never | Later |
| 3 | Depth of helpers | Two levels · unlimited | Two levels |
| 4 | Helpers at once | Per Project, default 3, refused above · queued above | Per Project, refused |
| 5 | Where parallel helpers write | One Workspace with file claims · a worktree per helper | Claims |
| 6 | Where claims come from | The approach note, structured · a `files` field in `decompose` | The approach note |
| 7 | A red check while others write | Provisional · counted at once | Provisional |
| 8 | A stuck helper | Said on its chip and to the main agent · stopped by Hemera | Said, not stopped |
| 9 | The build Session's layout | A · Strip · B · Build and Chat · C · Drawer | A · Strip |
| 10 | Task groups | None · groups | None: claims isolate by file |
