import { Button, Checkbox, Kbd, Select, Tabs } from '@hemera/ui'
import {
  type ChangeName,
  EXPRESSIONS,
  FACE_SIZES,
  FACE_STATES,
  Face,
  type FaceSize,
  type FaceState,
  type FaceTiming,
  type FaceTuning,
  TUNING,
  between,
  changeBetween,
  detailOf,
  dice,
  onFrame,
} from '@hemera/ui/face'
import { cn } from 'cn'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { labClock } from './clock.ts'
import { Choice, Range, Section, ms } from './controls.tsx'
import { type Sprite, SpritesContext, type Sprites } from './sprites.tsx'
import { type Played, type Telling, lengthOf } from './story.ts'
import { Crowd } from './views/crowd.tsx'
import { Film } from './views/film.tsx'
import { Matrix } from './views/matrix.tsx'
import { Sizes } from './views/sizes.tsx'
import { GROUNDS, type Ground, type Magnify, Stage } from './views/stage.tsx'

/** The key that puts the face in each state. */
const KEYS: Record<FaceState, string> = {
  idle: 'i',
  thinking: 't',
  reading: 'r',
  writing: 'w',
  running: 'c',
  checking: 'k',
  question: 'q',
  permission: 'p',
  blocked: 'b',
  done: 'd',
  error: 'e',
  silent: 's',
  asleep: 'z',
}

/** How many changes the lab remembers, for going back through them. */
const REMEMBERED = 200

/** One frame at sixty, which is what a step moves the clock by. */
const FRAME = 1 / 60

const VIEWS = ['stage', 'transitions', 'film', 'crowd', 'sizes'] as const

type View = (typeof VIEWS)[number]

/** What the address asks the lab to open on: `?view=film&from=thinking`, to share a view. */
const ASKED = new URLSearchParams(globalThis.location.search)

/** The view the address names, or the stage. */
function askedView(): View {
  return VIEWS.find((view) => view === ASKED.get('view')) ?? 'stage'
}

/** The state the address names for the frame-by-frame view, or idle. */
function askedFrom(): FaceState {
  return FACE_STATES.find((state) => state === ASKED.get('from')) ?? 'idle'
}

/** The script of an interruption: from one state to another, and a third before it lands. */
interface Interruption {
  readonly from: FaceState
  readonly to: FaceState
  readonly then: FaceState
  /** When the third comes, as a share of the change it interrupts. */
  readonly share: number
}

const STATE_ITEMS = FACE_STATES.map((state) => ({ value: state, label: EXPRESSIONS[state].label }))

/** The changes of state, in the order the preset writes them. */
const CHANGES = Object.keys(TUNING.timing.change).filter(
  (name): name is ChangeName => name in TUNING.timing.change,
)

/** Whether a key press belongs to a field rather than to the lab. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

export function Lab(): ReactNode {
  const clock = useMemo(labClock, [])
  const [history, setHistory] = useState<readonly Played[]>([{ state: 'idle', at: 0 }])
  const [seed, setSeed] = useState(1)
  const [size, setSize] = useState<FaceSize>('hero')
  const [magnify, setMagnify] = useState<Magnify>(2)
  const [ground, setGround] = useState<Ground>('content')
  const [dark, setDark] = useState(false)
  const [mono, setMono] = useState(false)
  const [guides, setGuides] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [tuning, setTuning] = useState<FaceTuning>(TUNING)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [scrub, setScrub] = useState(0)
  const [view, setView] = useState<View>(askedView)
  const [autoplay, setAutoplay] = useState(false)
  const [every, setEvery] = useState<readonly [number, number]>([2, 6])
  const [script, setScript] = useState<Interruption>({
    from: 'writing',
    to: 'done',
    then: 'error',
    share: 0.4,
  })
  const [copied, setCopied] = useState(false)

  const telling = useMemo<Telling>(
    () => ({ seed, detail: detailOf(size), reduced, tuning }),
    [seed, size, reduced, tuning],
  )
  const current = history.at(-1)?.state ?? 'idle'

  // One loop for everything the lab draws, all of it at the lab's own time.
  const sprites = useMemo(() => {
    const drawn = new Set<Sprite>()
    const said: Sprites = {
      add: (sprite) => {
        drawn.add(sprite)
        return () => {
          drawn.delete(sprite)
        }
      },
    }
    return { drawn, said }
  }, [])
  useEffect(
    () =>
      onFrame(() => {
        const at = clock.now()
        for (const sprite of sprites.drawn) sprite(at)
      }),
    [clock, sprites],
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  /** Puts the face in `state` now, forgetting whatever the story said after now. */
  const go = useCallback(
    (state: FaceState) => {
      const at = clock.now()
      setHistory((was) => {
        const kept = was.filter((played) => played.at <= at)
        if (kept.at(-1)?.state === state) return kept
        return [...kept, { state, at }].slice(-REMEMBERED)
      })
    },
    [clock],
  )

  /** Plays the last change again, from a face at rest in the state it came from. */
  const again = useCallback(() => {
    const at = clock.now()
    setHistory((was) => {
      const to = was.at(-1)
      const from = was.at(-2)
      if (to === undefined || from === undefined) return was
      return [
        { state: from.state, at },
        { state: to.state, at: at + 0.8 },
      ]
    })
  }, [clock])

  const interrupt = (): void => {
    const at = clock.now()
    const length = lengthOf(script.from, script.to, tuning)
    setHistory([
      { state: script.from, at },
      { state: script.to, at: at + 1 },
      { state: script.then, at: at + 1 + length * script.share },
    ])
  }

  const pause = useCallback(() => {
    clock.pause()
    setPaused(true)
    setScrub(clock.now())
  }, [clock])

  const play = useCallback(() => {
    clock.play()
    setPaused(false)
  }, [clock])

  const step = useCallback(
    (seconds: number) => {
      clock.step(seconds)
      setScrub(clock.now())
    },
    [clock],
  )

  // Now and then, a state drawn from the seed: the face left to live a working day.
  const next = useRef(0)
  const random = useMemo(() => dice(seed + 7), [seed])
  useEffect(() => {
    if (!autoplay) return undefined
    next.current = clock.now() + between(random(), every[0], every[1])
    return sprites.said.add((at) => {
      if (at < next.current) return
      go(FACE_STATES[Math.floor(random() * FACE_STATES.length)]!)
      next.current = at + between(random(), every[0], every[1])
    })
  }, [autoplay, every, random, clock, go, sprites])

  useEffect(() => {
    const pressed = (event: KeyboardEvent): void => {
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      const state = FACE_STATES.find((one) => KEYS[one] === event.key)
      if (state !== undefined) {
        go(state)
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        if (clock.running()) pause()
        else play()
      } else if (event.key === 'ArrowRight' && !clock.running()) step(FRAME)
      else if (event.key === 'ArrowLeft' && !clock.running()) step(-FRAME)
      else if (event.key === '.') again()
    }
    globalThis.addEventListener('keydown', pressed)
    return () => {
      globalThis.removeEventListener('keydown', pressed)
    }
  }, [go, again, pause, play, step, clock])

  const timed = (change: (timing: FaceTiming) => FaceTiming): void => {
    setTuning((was) => ({ ...was, timing: change(was.timing) }))
  }

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const start = history[0]?.at ?? 0

  return (
    <SpritesContext.Provider value={sprites.said}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="flex w-menu shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-page">
          <header className="flex items-center gap-3 border-b border-border px-4 py-4">
            <Face state={current} size="md" seed={seed} />
            <div className="flex flex-col">
              <h1 className="text-base font-medium">Face lab</h1>
              <p className="text-xs text-muted-foreground">
                Hemera's face, and every number it plays by.
              </p>
            </div>
          </header>

          <Section title="State">
            <div className="grid grid-cols-2 gap-1">
              {FACE_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={state === current}
                  onClick={() => go(state)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs focus-ring',
                    state === current
                      ? 'border-primary bg-primary-muted text-primary-muted-foreground'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  <Face state={state} size="icon" seed={3} />
                  <span className="min-w-0 flex-1 truncate">{state}</span>
                  <Kbd keys={KEYS[state].toUpperCase()} />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={again}>
                Play the last change again
              </Button>
              <Kbd keys="." />
            </div>
          </Section>

          <Section title="Interrupt">
            <Select
              label="From"
              items={STATE_ITEMS}
              value={script.from}
              onValueChange={(from) => setScript((was) => ({ ...was, from }))}
            />
            <Select
              label="To"
              items={STATE_ITEMS}
              value={script.to}
              onValueChange={(to) => setScript((was) => ({ ...was, to }))}
            />
            <Select
              label="Then, before it lands"
              items={STATE_ITEMS}
              value={script.then}
              onValueChange={(then) => setScript((was) => ({ ...was, then }))}
            />
            <Range
              label={`Interrupted at, of ${changeBetween(script.from, script.to)}`}
              value={script.share}
              min={0}
              max={1}
              step={0.05}
              format={(share) => `${String(Math.round(share * 100))} %`}
              onChange={(share) => setScript((was) => ({ ...was, share }))}
            />
            <Button size="sm" variant="primary" onClick={interrupt}>
              Play it
            </Button>
          </Section>

          <Section title="Clock">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={paused ? play : pause}>
                {paused ? 'Play' : 'Pause'}
              </Button>
              <Button size="sm" disabled={!paused} onClick={() => step(-FRAME)}>
                Frame back
              </Button>
              <Button size="sm" disabled={!paused} onClick={() => step(FRAME)}>
                Frame on
              </Button>
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Kbd keys="Space" /> pause · <Kbd keys="←" /> <Kbd keys="→" /> a frame
            </p>
            <Range
              label="Speed"
              value={speed}
              min={0.05}
              max={2}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={(value) => {
                clock.setSpeed(value)
                setSpeed(value)
              }}
            />
            {paused && (
              <Range
                label="Time"
                value={scrub}
                min={start}
                max={Math.max(scrub, history.at(-1)?.at ?? 0) + 3}
                step={FRAME}
                format={(value) => `${value.toFixed(2)} s`}
                onChange={(value) => {
                  clock.seek(value)
                  setScrub(value)
                }}
              />
            )}
            <Checkbox
              checked={autoplay}
              onCheckedChange={setAutoplay}
              label="Live a working day"
              description="A state drawn from the seed every few seconds."
            />
            {autoplay && (
              <Range
                label="Between two changes, at most"
                value={every[1]}
                min={0.5}
                max={12}
                step={0.5}
                format={(value) => `${value.toFixed(1)} s`}
                onChange={(most) => setEvery([Math.min(every[0], most), most])}
              />
            )}
          </Section>

          <Section title="Look">
            <Choice label="Size" options={FACE_SIZES} value={size} onChange={setSize} />
            <Choice
              label="Magnified"
              options={[1, 2, 3, 4] as const}
              value={magnify}
              name={(times) => `${String(times)}×`}
              onChange={setMagnify}
            />
            <Choice
              label="Drawn on"
              options={Object.keys(GROUNDS).filter((name): name is Ground => name in GROUNDS)}
              value={ground}
              onChange={setGround}
            />
            <Checkbox checked={dark} onCheckedChange={setDark} label="Dark theme" />
            <Checkbox
              checked={mono}
              onCheckedChange={setMono}
              label="Without colour"
              description="A state is told by its shape; the colour only says it again."
            />
            <Checkbox
              checked={guides}
              onCheckedChange={setGuides}
              label="Show the points"
              description="The three points of every stroke, and where the head turns about."
            />
            <Checkbox
              checked={reduced}
              onCheckedChange={setReduced}
              label="Less movement"
              description="Still expressions and a soft cross-fade, as a system asking for it gets."
            />
          </Section>

          <Section title="Life">
            <div className="flex items-end gap-2">
              <Range label="Seed" value={seed} min={1} max={999} step={1} onChange={setSeed} />
              <Button size="sm" onClick={() => setSeed(1 + Math.floor(Math.random() * 999))}>
                Draw
              </Button>
            </div>
            {(['blink', 'motion', 'aside', 'flourish'] as const).map((part) => (
              <Checkbox
                key={part}
                checked={tuning.life[part]}
                onCheckedChange={(on) =>
                  setTuning((was) => ({ ...was, life: { ...was.life, [part]: on } }))
                }
                label={
                  {
                    blink: 'Blinks',
                    motion: 'Gestures',
                    aside: 'Borrowed gestures',
                    flourish: 'Flourishes',
                  }[part]
                }
              />
            ))}
            <Checkbox
              checked={tuning.loop}
              onCheckedChange={(loop) => setTuning((was) => ({ ...was, loop }))}
              label="Flourish on a loop"
              description="Plays the state's flourish back to back, to judge it."
            />
            <Range
              label="Gain"
              value={tuning.gain}
              min={0.25}
              max={3}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={(gain) => setTuning((was) => ({ ...was, gain }))}
            />
          </Section>

          <Section title="Changes">
            <Range
              label="Pace of every change"
              value={tuning.pace}
              min={0.25}
              max={4}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={(pace) => setTuning((was) => ({ ...was, pace }))}
            />
            <Range
              label="Speed kept when interrupted"
              value={tuning.carry}
              min={0}
              max={1}
              step={0.05}
              format={(value) => `${String(Math.round(value * 100))} %`}
              onChange={(carry) => setTuning((was) => ({ ...was, carry }))}
            />
            {CHANGES.map((name) => (
              <Range
                key={name}
                label={name}
                value={tuning.timing.change[name]}
                min={0.1}
                max={4}
                step={0.01}
                format={ms}
                onChange={(value) =>
                  timed((timing) => ({ ...timing, change: { ...timing.change, [name]: value } }))
                }
              />
            ))}
          </Section>

          <Section title="Beats">
            {(['down', 'up', 'gap', 'hold'] as const).map((part) => (
              <Range
                key={part}
                label={`Blink, ${part}`}
                value={tuning.timing.blink[part]}
                min={0.01}
                max={0.6}
                step={0.01}
                format={ms}
                onChange={(value) =>
                  timed((timing) => ({ ...timing, blink: { ...timing.blink, [part]: value } }))
                }
              />
            ))}
            <Range
              label="A change of shape"
              value={tuning.timing.shape}
              min={0.05}
              max={1.5}
              step={0.01}
              format={ms}
              onChange={(shape) => timed((timing) => ({ ...timing, shape }))}
            />
            <Range
              label="A gesture handed on"
              value={tuning.timing.handover}
              min={0.05}
              max={2}
              step={0.01}
              format={ms}
              onChange={(handover) => timed((timing) => ({ ...timing, handover }))}
            />
            <Range
              label="The cross-fade of less movement"
              value={tuning.timing.fade}
              min={0.05}
              max={2}
              step={0.01}
              format={ms}
              onChange={(fade) => timed((timing) => ({ ...timing, fade }))}
            />
          </Section>

          <Section title="Keep">
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy the numbers'}
              </Button>
              <Button size="sm" onClick={() => setTuning(TUNING)}>
                Back to the preset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The numbers are the motion preset's `face` kind and the player's tuning, as JSON.
            </p>
          </Section>
        </aside>

        <main className={cn('flex min-w-0 flex-1 flex-col p-6', mono && 'grayscale')}>
          <Tabs
            label="What the lab shows"
            value={view}
            onValueChange={setView}
            items={[
              {
                value: 'stage',
                label: 'Stage',
                panel: (
                  <Stage
                    history={history}
                    telling={telling}
                    size={size}
                    magnify={magnify}
                    ground={ground}
                    guides={guides}
                  />
                ),
              },
              { value: 'transitions', label: 'Every change', panel: <Matrix telling={telling} /> },
              {
                value: 'film',
                label: 'Frame by frame',
                panel: (
                  <Film
                    telling={telling}
                    start={askedFrom()}
                    lives={ASKED.get('show') === 'lives'}
                  />
                ),
              },
              { value: 'crowd', label: 'Crowd', panel: <Crowd telling={telling} /> },
              {
                value: 'sizes',
                label: 'Sizes',
                panel: <Sizes history={history} telling={telling} />,
              },
            ]}
          />
        </main>
      </div>
    </SpritesContext.Provider>
  )
}
