export interface Builtin {
  name: string
  /** Fixed argument count, or -1 for "one or more". */
  arity: number
  fn: (...args: number[]) => number
}

/** Callable functions. `CALL` operands are (index into this table, argc). */
export const BUILTINS: readonly Builtin[] = [
  { name: 'min', arity: -1, fn: Math.min },
  { name: 'max', arity: -1, fn: Math.max },
  { name: 'abs', arity: 1, fn: Math.abs },
  { name: 'sqrt', arity: 1, fn: Math.sqrt },
]

export function builtinIndex(name: string): number {
  return BUILTINS.findIndex((b) => b.name === name)
}

export function arityOk(b: Builtin, argc: number): boolean {
  return b.arity === -1 ? argc >= 1 : argc === b.arity
}
