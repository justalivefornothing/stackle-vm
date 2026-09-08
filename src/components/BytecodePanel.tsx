import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { fmtAddr, fmtNum, lineCol, type Instruction, type Program, type Span } from '../lang'
import { Panel } from './Panel'

interface BytecodePanelProps {
  program: Program | null
  /** Address of the highlighted instruction (next to execute, or the one that faulted). */
  pc: number | null
  faulted: boolean
  /** Instruction counts without / with folding, for the optimizer diff. */
  counts: { plain: number; folded: number } | null
  fold: boolean
  emptyMessage: string
  onHover: (span: Span | null) => void
}

function posLabel(src: string, span: Span): string {
  const a = lineCol(src, span.start)
  const b = lineCol(src, span.end)
  return `${a.line}:${a.col}–${b.line}:${b.col}`
}

export function BytecodePanel({ program, pc, faulted, counts, fold, emptyMessage, onHover }: BytecodePanelProps) {
  const instrs = useMemo(() => program?.instructions() ?? [], [program])
  const activeRef = useRef<HTMLLIElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [pc, program])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])

  const active = instrs.find((i) => i.addr === pc) ?? null
  const activeRange = active ? [active.addr, active.addr + 1 + active.bytes.length] : null
  const tone = faulted ? 'text-ember' : 'text-phosphor'

  const aside = counts && (
    <span>
      {fold && counts.plain !== counts.folded ? (
        <>
          <s className="text-dim/70">{counts.plain}</s> <span className="text-phosphor">→ {counts.folded}</span> instr{' '}
          <span className="text-phosphor">(−{counts.plain - counts.folded})</span>
        </>
      ) : (
        <>
          {counts.plain} instr
          {counts.folded < counts.plain && (
            <span className="text-dim/70"> · fold saves {counts.plain - counts.folded}</span>
          )}
        </>
      )}
    </span>
  )

  const copy = async () => {
    if (!program) return
    try {
      await navigator.clipboard.writeText(program.hex())
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Panel title="Bytecode" aside={aside}>
      {!program ? (
        <p className="m-3 flex min-h-[9.5rem] flex-1 items-center justify-center rounded border border-dashed border-edge p-4 text-center text-[12px] text-dim">
          {emptyMessage}
        </p>
      ) : (
        <ol
          className="m-3 mb-0 max-h-[30rem] flex-1 overflow-auto rounded border border-edge bg-ink py-1 text-[12px] leading-6"
          onMouseLeave={() => onHover(null)}
        >
          {instrs.map((ins) => (
            <Row
              key={ins.addr}
              ins={ins}
              active={ins.addr === pc}
              tone={tone}
              ref={ins.addr === pc ? activeRef : undefined}
              label={posLabel(program.source, ins.span)}
              snippet={program.source.slice(ins.span.start, ins.span.end).replace(/\s+/g, ' ')}
              onHover={onHover}
            />
          ))}
        </ol>
      )}

      <div className="px-3 pt-2 pb-3 text-[11px] leading-5">
        <div className="flex items-center justify-between">
          <span className="text-mute">
            hex dump{' '}
            <span className="text-dim">
              · {program?.code.length ?? 0} bytes · pool [{program?.constants.map(fmtNum).join(', ') ?? ''}]
            </span>
          </span>
          <button
            type="button"
            onClick={copy}
            disabled={!program}
            className="rounded border border-edge px-2 py-0.5 text-[11px] text-mute transition-colors hover:border-dim hover:text-fg focus-visible:ring-2 focus-visible:ring-phosphor/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre className="mt-1 max-h-24 overflow-auto font-mono text-[11px] leading-5 text-dim">
          {program && program.code.length > 0
            ? chunks(Array.from(program.code), 8).map((row, r) => (
                <div key={r}>
                  <span className="text-dim/60">{fmtAddr(r * 8)} </span>
                  {row.map((b, i) => {
                    const addr = r * 8 + i
                    const hot = activeRange && addr >= activeRange[0] && addr < activeRange[1]
                    return (
                      <span key={i} className={hot ? tone : undefined}>
                        {b.toString(16).padStart(2, '0')}{' '}
                      </span>
                    )
                  })}
                </div>
              ))
            : '—'}
        </pre>
      </div>
    </Panel>
  )
}

interface RowProps {
  ins: Instruction
  active: boolean
  tone: string
  label: string
  snippet: string
  ref?: Ref<HTMLLIElement>
  onHover: (span: Span | null) => void
}

function Row({ ins, active, tone, label, snippet, ref, onHover }: RowProps) {
  const [mnemonic, ...rest] = ins.text.split(' ')
  return (
    <li
      ref={ref}
      onMouseEnter={() => onHover(ins.span)}
      title={`${ins.text} — from ${label}`}
      className={`grid grid-cols-[0.75rem_3.25rem_minmax(0,1fr)_minmax(0,7rem)] items-center gap-x-2 px-2 transition-colors ${
        active ? `bg-white/[.04] ${tone}` : 'text-dim hover:bg-white/[.03]'
      }`}
    >
      <span aria-hidden>{active ? '▸' : ''}</span>
      <span className="tabular-nums">{fmtAddr(ins.addr)}</span>
      <span className="truncate">
        <span className={active ? 'font-semibold' : 'text-fg'}>{mnemonic}</span>
        {rest.length > 0 && <span className={active ? '' : 'text-mute'}> {rest.join(' ')}</span>}
      </span>
      <span className="truncate text-right text-[11px] opacity-80">{snippet}</span>
    </li>
  )
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}
