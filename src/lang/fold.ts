import { BUILTINS, arityOk, builtinIndex } from './builtins'
import type { BinOp, Expr } from './parser'

export const BINARY_FN: Record<BinOp, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '^': (a, b) => a ** b,
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
  '<': (a, b) => (a < b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
}

const isNum = (e: Expr): e is Extract<Expr, { type: 'num' }> => e.type === 'num'

/**
 * Constant folding: evaluate any subtree whose leaves are all literals.
 * Division by a literal zero is deliberately left alone so the runtime error
 * (and its source span) still happens where the user wrote it.
 */
export function fold(e: Expr): Expr {
  switch (e.type) {
    case 'num':
    case 'ident':
      return e
    case 'unary': {
      const operand = fold(e.operand)
      if (!isNum(operand)) return { ...e, operand }
      const value = e.op === '-' ? -operand.value : operand.value === 0 ? 1 : 0
      return { type: 'num', value, span: e.span }
    }
    case 'binary': {
      const left = fold(e.left)
      const right = fold(e.right)
      if (!isNum(left) || !isNum(right)) return { ...e, left, right }
      if ((e.op === '/' || e.op === '%') && right.value === 0) return { ...e, left, right }
      return { type: 'num', value: BINARY_FN[e.op](left.value, right.value), span: e.span }
    }
    case 'logical': {
      const left = fold(e.left)
      const right = fold(e.right)
      if (!isNum(left)) return { ...e, left, right }
      const short = e.op === '&&' ? left.value === 0 : left.value !== 0
      return short ? { ...left, span: e.span } : { ...right, span: e.span }
    }
    case 'ternary': {
      const cond = fold(e.cond)
      const then = fold(e.then)
      const otherwise = fold(e.else)
      if (!isNum(cond)) return { ...e, cond, then, else: otherwise }
      return { ...(cond.value !== 0 ? then : otherwise), span: e.span }
    }
    case 'let':
      return { ...e, value: fold(e.value), body: fold(e.body) }
    case 'call': {
      const args = e.args.map(fold)
      const idx = builtinIndex(e.name)
      const b = idx >= 0 ? BUILTINS[idx] : null
      if (!b || !arityOk(b, args.length) || !args.every(isNum)) return { ...e, args }
      return { type: 'num', value: b.fn(...args.map((a) => a.value)), span: e.span }
    }
  }
}
