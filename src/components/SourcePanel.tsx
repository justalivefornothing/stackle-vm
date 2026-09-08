import { useRef, type ReactNode } from 'react'
import type { Span } from '../lang'
import { Panel } from './Panel'

export interface Highlight {
  span: Span
  tone: 'active' | 'error' | 'hover'
}

interface SourcePanelProps {
  source: string
  onChange: (next: string) => void
  onRun: () => void
  highlight: Highlight | null
  status: ReactNode
}

const TONE: Record<Highlight['tone'], string> = {
  active: 'bg-phosphor/15 shadow-[inset_0_-2px_0_var(--color-phosphor)]',
  error: 'bg-ember/20 shadow-[inset_0_-2px_0_var(--color-ember)]',
  hover: 'bg-amber/15 shadow-[inset_0_-2px_0_var(--color-amber)]',
}

/** Textarea with a mirrored <pre> underneath it that paints the highlighted span. */
export function SourcePanel({ source, onChange, onRun, highlight, status }: SourcePanelProps) {
  const mirror = useRef<HTMLPreElement>(null)
  const span = highlight
    ? { start: Math.min(highlight.span.start, source.length), end: Math.min(highlight.span.end, source.length) }
    : null

  return (
    <Panel title="Source" aside={<span>{source.length} chars</span>}>
      <div className="relative m-3 min-h-[9.5rem] flex-1 rounded border border-edge bg-ink focus-within:border-dim">
        <pre
          ref={mirror}
          aria-hidden
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-[13px] leading-6 break-words whitespace-pre-wrap text-transparent"
        >
          {span && highlight ? (
            <>
              {source.slice(0, span.start)}
              <mark className={`rounded-sm text-transparent ${TONE[highlight.tone]}`}>
                {source.slice(span.start, span.end) || ' '}
              </mark>
              {source.slice(span.end)}
            </>
          ) : (
            source
          )}
          {'\n'}
        </pre>
        <textarea
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onRun()
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Stackle source expression"
          placeholder="let x = 3 in x * (x + 1)"
          className="relative block h-full min-h-[9.5rem] w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-6 break-words whitespace-pre-wrap text-fg caret-phosphor outline-none placeholder:text-dim/60"
        />
      </div>
      <div className="min-h-[3.25rem] border-t border-edge px-3 py-2 text-[12px] leading-5">{status}</div>
    </Panel>
  )
}
