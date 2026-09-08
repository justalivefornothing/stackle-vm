import { BUILTINS, arityOk, builtinIndex } from './builtins'
import type { BinOp, Expr } from './parser'
import { StackleError, type Span } from './tokens'

export const Op = {
  PUSH: 0x01,
  LOAD: 0x02,
  STORE: 0x03,
  POP: 0x04,
  DUP: 0x05,
  ADD: 0x10,
  SUB: 0x11,
  MUL: 0x12,
  DIV: 0x13,
  MOD: 0x14,
  POW: 0x15,
  NEG: 0x16,
  NOT: 0x20,
  EQ: 0x21,
  NE: 0x22,
  LT: 0x23,
  LE: 0x24,
  GT: 0x25,
  GE: 0x26,
  JMP: 0x30,
  JZ: 0x31,
  JNZ: 0x32,
  CALL: 0x40,
  RET: 0xff,
} as const

export type Opcode = (typeof Op)[keyof typeof Op]

export const OP_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(Op).map(([name, code]) => [code, name]),
)

/** Operand byte widths. Jumps take a little-endian u16; CALL takes (fn, argc). */
export const OP_WIDTH: Record<number, number> = {
  [Op.PUSH]: 1,
  [Op.LOAD]: 1,
  [Op.STORE]: 1,
  [Op.JMP]: 2,
  [Op.JZ]: 2,
  [Op.JNZ]: 2,
  [Op.CALL]: 2,
}

const BINARY_OP: Record<BinOp, Opcode> = {
  '+': Op.ADD,
  '-': Op.SUB,
  '*': Op.MUL,
  '/': Op.DIV,
  '%': Op.MOD,
  '^': Op.POW,
  '==': Op.EQ,
  '!=': Op.NE,
  '<': Op.LT,
  '<=': Op.LE,
  '>': Op.GT,
  '>=': Op.GE,
}

export interface Instruction {
  addr: number
  op: number
  mnemonic: string
  /** Raw operand bytes, e.g. `[3]` for `PUSH 3` or `[12, 0]` for `JZ 0x000c`. */
  bytes: number[]
  /** Human-readable form: `PUSH 2`, `LOAD x`, `JZ 0x000c`, `CALL min/2`. */
  text: string
  span: Span
}

export const fmtAddr = (n: number) => `0x${n.toString(16).padStart(4, '0')}`
export const fmtNum = (n: number) => (Number.isNaN(n) ? 'NaN' : String(n))

export class Program {
  code: Uint8Array
  constants: number[]
  /** Slot names; `LOAD 0` disassembles to `LOAD <names[0]>`. */
  names: string[]
  spans: Map<number, Span>
  source: string

  constructor(code: Uint8Array, constants: number[], names: string[], spans: Map<number, Span>, source: string) {
    this.code = code
    this.constants = constants
    this.names = names
    this.spans = spans
    this.source = source
  }

  spanAt(addr: number): Span {
    return this.spans.get(addr) ?? { start: 0, end: this.source.length }
  }

  /** Decode the byte array back into instructions (the disassembler). */
  instructions(): Instruction[] {
    const out: Instruction[] = []
    let pc = 0
    while (pc < this.code.length) {
      const addr = pc
      const op = this.code[pc++]
      const width = OP_WIDTH[op] ?? 0
      const bytes = Array.from(this.code.subarray(pc, pc + width))
      pc += width
      const mnemonic = OP_NAME[op] ?? `??${op.toString(16)}`
      out.push({ addr, op, mnemonic, bytes, text: this.format(op, mnemonic, bytes), span: this.spanAt(addr) })
    }
    return out
  }

  private format(op: number, mnemonic: string, b: number[]): string {
    switch (op) {
      case Op.PUSH:
        return `${mnemonic} ${fmtNum(this.constants[b[0]])}`
      case Op.LOAD:
      case Op.STORE:
        return `${mnemonic} ${this.names[b[0]]}`
      case Op.JMP:
      case Op.JZ:
      case Op.JNZ:
        return `${mnemonic} ${fmtAddr(b[0] | (b[1] << 8))}`
      case Op.CALL:
        return `${mnemonic} ${BUILTINS[b[0]].name}/${b[1]}`
      default:
        return mnemonic
    }
  }

  disassemble(): string[] {
    return this.instructions().map((i) => i.text)
  }

  hex(): string {
    return Array.from(this.code, (b) => b.toString(16).padStart(2, '0')).join(' ')
  }
}

class Emitter {
  bytes: number[] = []
  constants: number[] = []
  names: string[] = []
  spans = new Map<number, Span>()
  scopes: Map<string, number>[] = [new Map()]
  source: string

  constructor(source: string) {
    this.source = source
  }

  fail(detail: string, span: Span): never {
    throw new StackleError('compile', detail, span, this.source)
  }

  emit(op: Opcode, span: Span, ...operands: number[]) {
    this.spans.set(this.bytes.length, span)
    this.bytes.push(op, ...operands)
  }

  /** Emit a jump with a placeholder target; returns the operand offset to patch. */
  emitJump(op: Opcode, span: Span): number {
    this.emit(op, span, 0, 0)
    return this.bytes.length - 2
  }

  patch(at: number, target = this.bytes.length) {
    this.bytes[at] = target & 0xff
    this.bytes[at + 1] = (target >> 8) & 0xff
  }

  constant(value: number, span: Span): number {
    let idx = this.constants.findIndex((c) => Object.is(c, value))
    if (idx === -1) {
      if (this.constants.length === 256) this.fail('Too many constants (max 256)', span)
      idx = this.constants.push(value) - 1
    }
    return idx
  }

  newSlot(name: string, span: Span): number {
    if (this.names.length === 256) this.fail('Too many locals (max 256)', span)
    return this.names.push(name) - 1
  }

  /** Walk the scope chain innermost-first; unbound names get a global slot so `LOAD x` still compiles. */
  resolve(name: string, span: Span): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const slot = this.scopes[i].get(name)
      if (slot !== undefined) return slot
    }
    const slot = this.newSlot(name, span)
    this.scopes[0].set(name, slot)
    return slot
  }

  gen(e: Expr): void {
    switch (e.type) {
      case 'num':
        this.emit(Op.PUSH, e.span, this.constant(e.value, e.span))
        return
      case 'ident':
        this.emit(Op.LOAD, e.span, this.resolve(e.name, e.span))
        return
      case 'unary':
        this.gen(e.operand)
        this.emit(e.op === '-' ? Op.NEG : Op.NOT, e.span)
        return
      case 'binary': {
        this.gen(e.left)
        this.gen(e.right)
        // DIV/MOD record the divisor's span so "Division by zero" points at the operand that was zero.
        const span = e.op === '/' || e.op === '%' ? e.right.span : e.span
        this.emit(BINARY_OP[e.op], span)
        return
      }
      case 'logical': {
        // a && b: keep a if it is falsy, otherwise replace it with b (JS-style short circuit).
        this.gen(e.left)
        this.emit(Op.DUP, e.left.span)
        const skip = this.emitJump(e.op === '&&' ? Op.JZ : Op.JNZ, e.left.span)
        this.emit(Op.POP, e.left.span)
        this.gen(e.right)
        this.patch(skip)
        return
      }
      case 'ternary': {
        this.gen(e.cond)
        const toElse = this.emitJump(Op.JZ, e.cond.span)
        this.gen(e.then)
        const toEnd = this.emitJump(Op.JMP, e.span)
        this.patch(toElse)
        this.gen(e.else)
        this.patch(toEnd)
        return
      }
      case 'let': {
        this.gen(e.value)
        const slot = this.newSlot(e.name, e.nameSpan)
        this.emit(Op.STORE, e.nameSpan, slot)
        this.scopes.push(new Map([[e.name, slot]]))
        this.gen(e.body)
        this.scopes.pop()
        return
      }
      case 'call': {
        const idx = builtinIndex(e.name)
        if (idx === -1) this.fail(`Unknown function '${e.name}'`, e.span)
        const b = BUILTINS[idx]
        if (!arityOk(b, e.args.length)) {
          const want = b.arity === -1 ? 'at least 1 argument' : `${b.arity} argument${b.arity === 1 ? '' : 's'}`
          this.fail(`${e.name} expects ${want}, got ${e.args.length}`, e.span)
        }
        for (const arg of e.args) this.gen(arg)
        this.emit(Op.CALL, e.span, idx, e.args.length)
        return
      }
    }
  }
}

/** Single-pass code generation from AST to bytecode. */
export function generate(ast: Expr, source: string): Program {
  const em = new Emitter(source)
  em.gen(ast)
  em.emit(Op.RET, ast.span)
  return new Program(Uint8Array.from(em.bytes), em.constants, em.names, em.spans, source)
}
