export interface Span {
  start: number
  end: number
}

export type TokenKind =
  | 'num'
  | 'ident'
  | 'let'
  | 'in'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '('
  | ')'
  | ','
  | '?'
  | ':'
  | '='
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
  | '!'
  | 'eof'

export interface Token {
  kind: TokenKind
  text: string
  value: number
  span: Span
}

export type ErrorKind = 'syntax' | 'compile' | 'runtime'

/** Every error Stackle raises carries a source span and a `line:col` suffix. */
export class StackleError extends Error {
  kind: ErrorKind
  detail: string
  span: Span

  constructor(kind: ErrorKind, detail: string, span: Span, source: string) {
    super(`${detail} at ${formatPos(source, span.start)}`)
    this.name = 'StackleError'
    this.kind = kind
    this.detail = detail
    this.span = span
  }
}

export function lineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1
  let lineStart = 0
  const stop = Math.min(offset, source.length)
  for (let i = 0; i < stop; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, col: offset - lineStart + 1 }
}

export function formatPos(source: string, offset: number): string {
  const { line, col } = lineCol(source, offset)
  return `${line}:${col}`
}

const TWO_CHAR: Record<string, TokenKind> = {
  '<=': '<=',
  '>=': '>=',
  '==': '==',
  '!=': '!=',
  '&&': '&&',
  '||': '||',
}

const ONE_CHAR: Record<string, TokenKind> = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  '^': '^',
  '(': '(',
  ')': ')',
  ',': ',',
  '?': '?',
  ':': ':',
  '=': '=',
  '<': '<',
  '>': '>',
  '!': '!',
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c)
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const push = (kind: TokenKind, start: number, end: number, value = 0) =>
    tokens.push({ kind, text: source.slice(start, end), value, span: { start, end } })

  while (i < source.length) {
    const c = source[i]
    if (isSpace(c)) {
      i++
      continue
    }
    const start = i
    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      while (isDigit(source[i] ?? '')) i++
      if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
        i++
        while (isDigit(source[i] ?? '')) i++
      }
      if ((source[i] === 'e' || source[i] === 'E') && /[-+\d]/.test(source[i + 1] ?? '')) {
        i += 2
        while (isDigit(source[i] ?? '')) i++
      }
      push('num', start, i, Number(source.slice(start, i)))
      continue
    }
    if (isIdentStart(c)) {
      while (isIdentPart(source[i] ?? '')) i++
      const word = source.slice(start, i)
      push(word === 'let' || word === 'in' ? word : 'ident', start, i)
      continue
    }
    const two = TWO_CHAR[source.slice(i, i + 2)]
    if (two) {
      i += 2
      push(two, start, i)
      continue
    }
    const one = ONE_CHAR[c]
    if (one) {
      i++
      push(one, start, i)
      continue
    }
    throw new StackleError('syntax', `Unexpected character '${c}'`, { start, end: start + 1 }, source)
  }
  push('eof', source.length, source.length)
  return tokens
}
