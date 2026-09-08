import { BUILTINS } from './builtins'
import { Op, type Program } from './compiler'
import { StackleError } from './tokens'

const STACK_MAX = 256

export interface Snapshot {
  /** Address of the next instruction to execute. */
  pc: number
  /** Number of instructions executed so far. */
  step: number
  /** Operand stack, bottom first. */
  stack: number[]
  /** Unique id per pushed value (parallel to `stack`) so the UI can animate new cells. */
  ids: number[]
  /** One entry per slot; `null` while unbound. */
  locals: (number | null)[]
  done: boolean
  result: number | null
  error: StackleError | null
}

/** A fetch-decode-execute machine over a `Program`'s byte array. */
export class VM {
  program: Program
  pc = 0
  sp = 0
  steps = 0
  /** Address of the most recently executed (or faulting) instruction. */
  lastPc = 0
  halted = false
  result: number | null = null
  private stack = new Float64Array(STACK_MAX)
  private ids = new Uint32Array(STACK_MAX)
  private nextId = 1
  private locals: Float64Array
  private bound: Uint8Array

  constructor(program: Program) {
    this.program = program
    this.locals = new Float64Array(program.names.length)
    this.bound = new Uint8Array(program.names.length)
  }

  private fail(detail: string, at: number): never {
    throw new StackleError('runtime', detail, this.program.spanAt(at), this.program.source)
  }

  private push(v: number, at: number) {
    if (this.sp === STACK_MAX) this.fail('Stack overflow', at)
    this.ids[this.sp] = this.nextId++
    this.stack[this.sp++] = v
  }

  private pop(at: number): number {
    if (this.sp === 0) this.fail('Stack underflow', at)
    return this.stack[--this.sp]
  }

  /** Execute exactly one instruction. Throws `StackleError` on runtime faults. */
  step(): void {
    if (this.halted) return
    const code = this.program.code
    const at = this.pc
    if (at >= code.length) this.fail('Fell off the end of the program', at)
    const op = code[at]
    this.lastPc = at
    const u8 = () => code[this.pc++]
    const u16 = () => u8() | (u8() << 8)
    const bin = (f: (a: number, b: number) => number) => {
      const b = this.pop(at)
      const a = this.pop(at)
      this.push(f(a, b), at)
    }
    this.pc++
    this.steps++
    switch (op) {
      case Op.PUSH:
        this.push(this.program.constants[u8()], at)
        break
      case Op.LOAD: {
        const slot = u8()
        if (!this.bound[slot]) this.fail(`Unknown identifier '${this.program.names[slot]}'`, at)
        this.push(this.locals[slot], at)
        break
      }
      case Op.STORE: {
        const slot = u8()
        this.locals[slot] = this.pop(at)
        this.bound[slot] = 1
        break
      }
      case Op.POP:
        this.pop(at)
        break
      case Op.DUP: {
        const v = this.pop(at)
        this.push(v, at)
        this.push(v, at)
        break
      }
      case Op.ADD:
        bin((a, b) => a + b)
        break
      case Op.SUB:
        bin((a, b) => a - b)
        break
      case Op.MUL:
        bin((a, b) => a * b)
        break
      case Op.DIV:
        bin((a, b) => (b === 0 ? this.fail('Division by zero', at) : a / b))
        break
      case Op.MOD:
        bin((a, b) => (b === 0 ? this.fail('Division by zero', at) : a % b))
        break
      case Op.POW:
        bin((a, b) => a ** b)
        break
      case Op.NEG:
        this.push(-this.pop(at), at)
        break
      case Op.NOT:
        this.push(this.pop(at) === 0 ? 1 : 0, at)
        break
      case Op.EQ:
        bin((a, b) => (a === b ? 1 : 0))
        break
      case Op.NE:
        bin((a, b) => (a !== b ? 1 : 0))
        break
      case Op.LT:
        bin((a, b) => (a < b ? 1 : 0))
        break
      case Op.LE:
        bin((a, b) => (a <= b ? 1 : 0))
        break
      case Op.GT:
        bin((a, b) => (a > b ? 1 : 0))
        break
      case Op.GE:
        bin((a, b) => (a >= b ? 1 : 0))
        break
      case Op.JMP:
        this.pc = u16()
        break
      case Op.JZ: {
        const target = u16()
        if (this.pop(at) === 0) this.pc = target
        break
      }
      case Op.JNZ: {
        const target = u16()
        if (this.pop(at) !== 0) this.pc = target
        break
      }
      case Op.CALL: {
        const fn = BUILTINS[u8()]
        const argc = u8()
        const args = new Array<number>(argc)
        for (let i = argc - 1; i >= 0; i--) args[i] = this.pop(at)
        this.push(fn.fn(...args), at)
        break
      }
      case Op.RET:
        this.result = this.pop(at)
        this.halted = true
        break
      default:
        this.fail(`Illegal opcode 0x${op.toString(16)}`, at)
    }
  }

  snapshot(): Snapshot {
    return {
      pc: this.pc,
      step: this.steps,
      stack: Array.from(this.stack.subarray(0, this.sp)),
      ids: Array.from(this.ids.subarray(0, this.sp)),
      locals: this.program.names.map((_, i) => (this.bound[i] ? this.locals[i] : null)),
      done: this.halted,
      result: this.result,
      error: null,
    }
  }
}

/** Run a program to completion and return the value left on the stack. */
export function execute(program: Program): number {
  const vm = new VM(program)
  while (!vm.halted) vm.step()
  return vm.result as number
}

/**
 * Debugger driver: yields a full state snapshot before the first instruction
 * and after every step. The final snapshot has `done: true` and either a
 * `result` or an `error` (runtime faults are captured, not thrown); on a
 * fault the stack and locals are those seen by the faulting instruction.
 */
export function* trace(program: Program): Generator<Snapshot, void, void> {
  const vm = new VM(program)
  let before = vm.snapshot()
  yield before
  while (!vm.halted) {
    try {
      vm.step()
    } catch (err) {
      if (!(err instanceof StackleError)) throw err
      // Report the state as it was when the faulting instruction began, not half-popped.
      yield { ...before, pc: vm.lastPc, done: true, error: err }
      return
    }
    before = vm.snapshot()
    yield before
  }
}
