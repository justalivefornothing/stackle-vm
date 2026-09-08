import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  aside?: ReactNode
  children: ReactNode
}

export function Panel({ title, aside, children }: PanelProps) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col rounded-md border border-edge bg-panel">
      <header className="flex items-baseline justify-between gap-3 border-b border-edge px-3 py-1.5">
        <h2 className="font-pixel text-[22px] leading-none tracking-wide text-mute uppercase">{title}</h2>
        {aside && <div className="text-[11px] text-dim">{aside}</div>}
      </header>
      {children}
    </section>
  )
}
