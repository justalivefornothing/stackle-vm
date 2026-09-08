import { fmtAddr, fmtNum, type Program, type Snapshot } from '../lang'
import { Panel } from './Panel'

interface StackPanelProps {
  program: Program | null
  snapshot: Snapshot | null
  stepIndex: number
  canStep: boolean
  canBack: boolean
  onStep: () => void
  onBack: () => void
  onRun: () => void
  onReset: () => void
}

const BTN =
  'rounded border px-2.5 py-1 text-[12px] leading-5 transition-colors focus-visible:ring-2 focus-visible:ring-phosphor/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35'
const BTN_DIM = `${BTN} border-edge text-mute hover:border-dim hover:text-fg`
const BTN_HOT = `${BTN} border-phosphor/50 text-phosphor hover:bg-phosphor/10`

export function StackPanel(p: StackPanelProps) {
  const { snapshot: s, program } = p
  const stack = s?.stack ?? []
  const ids = s?.ids ?? []
  const names = program?.names ?? []

  const aside = s && (
    <span className="tabular-nums">
      step {s.step} · pc {fmtAddr(s.pc)}
    </span>
  )

  return (
    <Panel title="Stack" aside={aside}>
      <div
        className="flex flex-wrap gap-1.5 border-b border-edge px-3 py-2"
        role="toolbar"
        aria-label="Debugger controls"
      >
        <button type="button" className={BTN_DIM} onClick={p.onBack} disabled={!p.canBack} title="Back (←)">
          ◂ back
        </button>
        <button type="button" className={BTN_HOT} onClick={p.onStep} disabled={!p.canStep} title="Step (→)">
          step ▸
        </button>
        <button type="button" className={BTN_HOT} onClick={p.onRun} disabled={!p.canStep} title="Run (R)">
          run ▸▸
        </button>
        <button type="button" className={BTN_DIM} onClick={p.onReset} disabled={p.stepIndex === 0} title="Reset (Esc)">
          ↺ reset
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1">
        <div>
          <h3 className="mb-1.5 text-[11px] tracking-wider text-dim uppercase">operand stack</h3>
          <ol
            aria-label="Operand stack, top first"
            className="flex min-h-[9.5rem] flex-col gap-1 rounded border border-edge bg-ink p-2"
          >
            {stack.length === 0 && (
              <li className="flex flex-1 items-center justify-center text-[12px] text-dim/70">
                {s?.done ? 'stack empty · halted' : 'stack empty'}
              </li>
            )}
            {stack
              .map((v, i) => ({ v, id: ids[i], depth: stack.length - 1 - i }))
              .reverse()
              .map(({ v, id, depth }) => (
                <li
                  key={id}
                  className={`stack-cell flex items-center justify-between rounded border px-2.5 py-1 text-[13px] tabular-nums ${
                    depth === 0 ? 'border-phosphor/60 bg-phosphor/10 text-phosphor' : 'border-edge text-fg'
                  }`}
                >
                  <span className="text-[10px] text-dim">{depth === 0 ? 'top' : `−${depth}`}</span>
                  <span>{fmtNum(v)}</span>
                </li>
              ))}
          </ol>
        </div>

        <div>
          <h3 className="mb-1.5 text-[11px] tracking-wider text-dim uppercase">locals</h3>
          {names.length === 0 ? (
            <p className="rounded border border-dashed border-edge px-2.5 py-2 text-[12px] text-dim/70">no bindings</p>
          ) : (
            <table className="w-full border-collapse text-[12px] leading-6">
              <thead className="sr-only">
                <tr>
                  <th>slot</th>
                  <th>name</th>
                  <th>value</th>
                </tr>
              </thead>
              <tbody>
                {names.map((name, i) => {
                  const v = s?.locals[i] ?? null
                  return (
                    <tr key={i} className="border-t border-edge first:border-t-0">
                      <td className="w-8 text-dim tabular-nums">#{i}</td>
                      <td className="text-fg">{name}</td>
                      <td className={`text-right tabular-nums ${v === null ? 'text-dim/60' : 'text-phosphor'}`}>
                        {v === null ? 'unbound' : fmtNum(v)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className="min-h-[2.75rem] border-t border-edge px-3 py-2 text-[12px] leading-5">
        {s?.done && s.error ? (
          <span className="text-ember">✖ {s.error.message}</span>
        ) : s?.done ? (
          <span className="text-phosphor">
            <span className="text-dim">halted · result </span>
            <span className="font-pixel text-[22px] leading-none">{fmtNum(s.result ?? NaN)}</span>
          </span>
        ) : s ? (
          <span className="text-dim">
            {p.stepIndex === 0 ? 'ready · press step or run' : `running · ${stack.length} on stack`}
          </span>
        ) : (
          <span className="text-dim">nothing to run</span>
        )}
      </footer>
    </Panel>
  )
}
