import { StackleError, type Span, type Token, type TokenKind } from './tokens'

export type BinOp = '+' | '-' | '*' | '/' | '%' | '^' | '==' | '!=' | '<' | '<=' | '>' | '>='
export type LogicalOp = '&&' | '||'
export type UnaryOp = '-' | '!'

export type Expr =
  | { type: 'num'; value: number; span: Span }
  | { type: 'ident'; name: string; span: Span }
  | { type: 'unary'; op: UnaryOp; operand: Expr; span: Span }
  | { type: 'binary'; op: BinOp; left: Expr; right: Expr; span: Span }
  | { type: 'logical'; op: LogicalOp; left: Expr; right: Expr; span: Span }
  | { type: 'ternary'; cond: Expr; then: Expr; else: Expr; span: Span }
  | { type: 'let'; name: string; nameSpan: Span; value: Expr; body: Expr; span: Span }
  | { type: 'call'; name: string; args: Expr[]; span: Span }

/**
 * Binding powers for infix operators as [left, right]. Left-associative
 * operators use (n, n+1); right-associative `^` uses (n+1, n) so the
 * right operand may re-grab another `^`. `?:` is handled explicitly.
 */
const INFIX: Partial<Record<TokenKind, readonly [number, number]>> = {
  '||': [3, 4],
  '&&': [5, 6],
  '==': [7, 8],
  '!=': [7, 8],
  '<': [9, 10],
  '<=': [9, 10],
  '>': [9, 10],
  '>=': [9, 10],
  '+': [11, 12],
  '-': [11, 12],
  '*': [13, 14],
  '/': [13, 14],
  '%': [13, 14],
  '^': [18, 17],
}
const TERNARY_BP = 2
/** Unary minus binds tighter than `*` but looser than `^`, so `-2 ^ 2` is -4. */
const PREFIX_BP = 15

const spanOf = (a: Span, b: Span): Span => ({ start: a.start, end: b.end })

class Parser {
  private pos = 0
  private tokens: Token[]
  private source: string

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens
    this.source = source
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private next(): Token {
    return this.tokens[this.pos++]
  }

  private fail(detail: string, span: Span): never {
    throw new StackleError('syntax', detail, span, this.source)
  }

  private describe(tok: Token): string {
    return tok.kind === 'eof' ? 'end of input' : `'${tok.text}'`
  }

  private expect(kind: TokenKind): Token {
    const tok = this.peek()
    if (tok.kind !== kind) this.fail(`Expected '${kind}' but found ${this.describe(tok)}`, tok.span)
    return this.next()
  }

  parseProgram(): Expr {
    const expr = this.parseExpr(0)
    const tok = this.peek()
    if (tok.kind !== 'eof') this.fail(`Unexpected ${this.describe(tok)}`, tok.span)
    return expr
  }

  parseExpr(minBp: number): Expr {
    let left = this.parsePrefix()
    for (;;) {
      const tok = this.peek()
      if (tok.kind === '?') {
        if (TERNARY_BP < minBp) break
        this.next()
        const then = this.parseExpr(0)
        this.expect(':')
        const otherwise = this.parseExpr(TERNARY_BP - 1)
        left = { type: 'ternary', cond: left, then, else: otherwise, span: spanOf(left.span, otherwise.span) }
        continue
      }
      const bp = INFIX[tok.kind]
      if (!bp || bp[0] < minBp) break
      this.next()
      const right = this.parseExpr(bp[1])
      const span = spanOf(left.span, right.span)
      left =
        tok.kind === '&&' || tok.kind === '||'
          ? { type: 'logical', op: tok.kind, left, right, span }
          : { type: 'binary', op: tok.kind as BinOp, left, right, span }
    }
    return left
  }

  /** "Null denotation": literals, identifiers, calls, groups, prefix ops, let. */
  private parsePrefix(): Expr {
    const tok = this.next()
    switch (tok.kind) {
      case 'num':
        return { type: 'num', value: tok.value, span: tok.span }
      case 'ident': {
        if (this.peek().kind !== '(') return { type: 'ident', name: tok.text, span: tok.span }
        this.next()
        const args: Expr[] = []
        if (this.peek().kind !== ')') {
          for (;;) {
            args.push(this.parseExpr(0))
            if (this.peek().kind !== ',') break
            this.next()
          }
        }
        const close = this.expect(')')
        return { type: 'call', name: tok.text, args, span: spanOf(tok.span, close.span) }
      }
      case '(': {
        const inner = this.parseExpr(0)
        const close = this.expect(')')
        // A parenthesised expression keeps its node but widens its span to the parens.
        return { ...inner, span: spanOf(tok.span, close.span) }
      }
      case '-':
      case '!': {
        const operand = this.parseExpr(PREFIX_BP)
        return { type: 'unary', op: tok.kind, operand, span: spanOf(tok.span, operand.span) }
      }
      case 'let': {
        const name = this.expect('ident')
        this.expect('=')
        const value = this.parseExpr(0)
        this.expect('in')
        const body = this.parseExpr(0)
        return { type: 'let', name: name.text, nameSpan: name.span, value, body, span: spanOf(tok.span, body.span) }
      }
      case 'eof':
        return this.fail('Unexpected end of input', tok.span)
      default:
        return this.fail(`Unexpected ${this.describe(tok)}`, tok.span)
    }
  }
}

export function parse(tokens: Token[], source: string): Expr {
  return new Parser(tokens, source).parseProgram()
}
