import { useEffect, useMemo, useState } from 'react'
import { BytecodePanel } from './components/BytecodePanel'
import { SourcePanel, type Highlight } from './components/SourcePanel'
import { StackPanel } from './components/StackPanel'
import { EXAMPLES } from './examples'
import { compile, fmtNum, StackleError, type Program, type Span } from './lang'
import { useDebugger } from './useDebugger'

type Compiled = { program: Program; error: null } | { program: null; error: StackleError | null }

function tryCompile(source: string, fold: boolean): Compiled {
  if (source.trim() === '') return { program: null, error: null }
  try {
    return { program: compile(source, { fold }), error: null }
  } catch (err) {
    if (err instanceof StackleError) return { program: null, error: err }
    throw err
  }
}

/** Initial state can come from a permalink: ?src=<expr>&fold=1&step=<n>. */
function readUrl() {
  const q = new URLSearchParams(window.location.search)
  const step = Number(q.get('step'))
  return {
    source: q.get('src') ?? EXAMPLES[0].source,
    fold: q.get('fold') === '1',
    step: Number.isFinite(step) && step > 0 ? Math.floor(step) : 0,
  }
}

export default function App() {
  const [initial] = useState(readUrl)
  const [source, setSource] = useState(initial.source)
  const [fold, setFold] = useState(initial.fold)
  const [hover, setHover] = useState<Span | null>(null)
  const [linked, setLinked] = useState(false)

  const plain = useMemo(() => tryCompile(source, false), [source])
  const folded = useMemo(() => tryCompile(source, true), [source])
  const { program, error: compileError } = fold ? folded : plain
  const counts =
    plain.program && folded.program
      ? { plain: plain.program.instructions().length, folded: folded.program.instructions().length }
      : null

  const dbg = useDebugger(program, initial.step)
  const snap = dbg.snapshot
  const runtimeError = snap?.error ?? null

  const permalink = async () => {
    const q = new URLSearchParams({ src: source, fold: fold ? '1' : '0', step: String(dbg.stepIndex) })
    const url = `${window.location.origin}${window.location.pathname}?${q}`
    try {
      await navigator.clipboard.writeText(url)
      window.history.replaceState(null, '', `?${q}`)
      setLinked(true)
      setTimeout(() => setLinked(false), 1400)
    } catch {
      setLinked(false)
    }
  }

  // Keyboard driving of the debugger, unless the user is typing in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const actions: Record<string, () => void> = {
        ArrowRight: dbg.step,
        ArrowLeft: dbg.back,
        r: dbg.run,
        R: dbg.run,
        Escape: dbg.reset,
      }
      const act = actions[e.key]
      if (act) {
        e.preventDefault()
        act()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dbg])

  const activeInstr = program && snap && !snap.done ? program.spanAt(snap.pc) : null
  const highlight: Highlight | null = hover
    ? { span: hover, tone: 'hover' }
    : compileError
      ? { span: compileError.span, tone: 'error' }
      : runtimeError
        ? { span: runtimeError.span, tone: 'error' }
        : activeInstr
          ? { span: activeInstr, tone: 'active' }
          : null

  const status = compileError ? (
    <span className="text-ember">
      ✖ <span className="text-dim">{compileError.kind} error ·</span> {compileError.message}
    </span>
  ) : runtimeError ? (
    <span className="text-ember">
      ✖ <span className="text-dim">runtime error ·</span> {runtimeError.message}
    </span>
  ) : snap?.done ? (
    <span className="text-phosphor">
      = {fmtNum(snap.result ?? NaN)} <span className="text-dim">after {snap.step} steps</span>
    </span>
  ) : program ? (
    <span className="text-dim">
      compiled · {program.code.length} bytes · {program.names.length} slot{program.names.length === 1 ? '' : 's'}
      {snap && snap.step > 0 && <> · at {snap.step}</>}
    </span>
  ) : (
    <span className="text-dim">type an expression to compile it</span>
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-pixel text-[44px] leading-none text-phosphor drop-shadow-[0_0_12px_rgba(57,255,136,.35)]">
            STACKLE
          </h1>
          <p className="hidden text-[12px] text-dim sm:block">expression → bytecode → stack vm</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={permalink}
            disabled={!program}
            title="Copy a link to this program at the current step"
            className="rounded border border-edge px-2 py-0.5 text-[12px] text-mute transition-colors hover:border-dim hover:text-fg focus-visible:ring-2 focus-visible:ring-phosphor/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {linked ? 'link copied' : '⎘ permalink'}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-mute select-none">
            <span>constant folding</span>
            <button
              type="button"
              role="switch"
              aria-checked={fold}
              onClick={() => setFold((f) => !f)}
              className={`relative h-5 w-9 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-phosphor/60 focus-visible:outline-none ${
                fold ? 'border-phosphor/70 bg-phosphor/25' : 'border-edge bg-ink'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
                  fold ? 'translate-x-4 bg-phosphor' : 'bg-dim'
                }`}
              />
            </button>
          </label>
        </div>
      </header>

      <nav aria-label="Example programs" className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="mr-1 text-dim">gallery</span>
        {EXAMPLES.map((ex) => {
          const on = ex.source === source
          return (
            <button
              key={ex.name}
              type="button"
              title={ex.blurb}
              onClick={() => setSource(ex.source)}
              className={`rounded border px-2 py-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-phosphor/60 focus-visible:outline-none ${
                on
                  ? 'border-phosphor/60 bg-phosphor/10 text-phosphor'
                  : 'border-edge text-mute hover:border-dim hover:text-fg'
              }`}
            >
              {ex.name}
            </button>
          )
        })}
      </nav>

      <main className="grid grid-cols-1 gap-3 lg:min-h-[68vh] lg:grid-cols-3">
        <SourcePanel source={source} onChange={setSource} onRun={dbg.run} highlight={highlight} status={status} />
        <BytecodePanel
          program={program}
          pc={snap ? snap.pc : null}
          faulted={runtimeError !== null}
          counts={counts}
          fold={fold}
          emptyMessage={
            compileError ? 'fix the error on the left to see bytecode' : 'bytecode appears here as you type'
          }
          onHover={setHover}
        />
        <StackPanel
          program={program}
          snapshot={snap}
          stepIndex={dbg.stepIndex}
          canStep={dbg.canStep}
          canBack={dbg.canBack}
          onStep={dbg.step}
          onBack={dbg.back}
          onRun={dbg.run}
          onReset={dbg.reset}
        />
      </main>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim">
        <p>
          <kbd className="text-mute">→</kbd> step · <kbd className="text-mute">←</kbd> back ·{' '}
          <kbd className="text-mute">R</kbd> run · <kbd className="text-mute">Esc</kbd> reset ·{' '}
          <kbd className="text-mute">Ctrl+Enter</kbd> run from the editor
        </p>
        <p>tokenizer → pratt parser → bytecode → vm, all from scratch</p>
      </footer>
    </div>
  )
}
