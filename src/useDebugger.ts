import { useState } from 'react'
import { trace, type Program, type Snapshot } from './lang'

const MAX_STEPS = 10_000

interface DebugState {
  program: Program | null
  gen: Generator<Snapshot, void, void> | null
  /** Every snapshot seen so far; lets "back" rewind without re-running. */
  history: Snapshot[]
  cursor: number
}

function init(program: Program | null): DebugState {
  if (!program) return { program, gen: null, history: [], cursor: 0 }
  const gen = trace(program)
  const first = gen.next()
  return { program, gen, history: first.done ? [] : [first.value], cursor: 0 }
}

function pull(s: DebugState): DebugState {
  const last = s.history[s.history.length - 1]
  if (!s.gen || !last || last.done) return s
  const next = s.gen.next()
  if (next.done) return s
  return { ...s, history: [...s.history, next.value] }
}

/**
 * Wraps the VM trace generator in React state. Snapshots are pulled lazily
 * on Step and cached, so Back is free and Run is just "pull until done".
 * Generator mutation happens in the handlers (never inside a setState updater)
 * so StrictMode's double-invocation cannot advance the VM twice.
 */
export function useDebugger(program: Program | null, initialStep = 0) {
  const [state, setState] = useState(() => {
    let s = init(program)
    for (let i = 0; i < Math.min(initialStep, MAX_STEPS); i++) s = pull(s)
    return { ...s, cursor: Math.max(0, s.history.length - 1) }
  })
  // Derive fresh debugger state when the compiled program changes (React re-renders before commit).
  if (state.program !== program) setState(init(program))

  const current = state.history[state.cursor] ?? null
  const done = current?.done ?? true

  const step = () => {
    if (state.cursor < state.history.length - 1) return setState({ ...state, cursor: state.cursor + 1 })
    const s = pull(state)
    if (s !== state) setState({ ...s, cursor: s.history.length - 1 })
  }
  const back = () => state.cursor > 0 && setState({ ...state, cursor: state.cursor - 1 })
  const run = () => {
    let s = state
    for (let i = 0; i < MAX_STEPS; i++) {
      const n = pull(s)
      if (n === s) break
      s = n
    }
    setState({ ...s, cursor: s.history.length - 1 })
  }
  const reset = () => setState({ ...state, cursor: 0 })

  return {
    snapshot: current,
    stepIndex: state.cursor,
    canBack: state.cursor > 0,
    canStep: current !== null && !done,
    step,
    back,
    run,
    reset,
  }
}
