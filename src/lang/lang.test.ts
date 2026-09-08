import { describe, expect, it } from 'vitest'
import { compile, run, trace } from './index'

describe('spec', () => {
  it('respects precedence and right-associative ^', () => {
    expect(run('1 + 2 * 3 ^ 2')).toBe(19)
  })

  it('disassembles with resolved constants and names', () => {
    expect(compile('2 * 3 + x').disassemble()).toEqual(['PUSH 2', 'PUSH 3', 'MUL', 'LOAD x', 'ADD', 'RET'])
  })

  it('binds let and branches on ternary', () => {
    expect(run('let x = 4 in x > 3 ? x * 2 : 0')).toBe(8)
  })

  it('constant folding shrinks the bytecode', () => {
    expect(compile('1 + 2 * 3', { fold: true }).code.length).toBeLessThan(compile('1 + 2 * 3').code.length)
  })

  it('reports division by zero with a source position', () => {
    expect(() => run('10 / (5 - 5)')).toThrow(/Division by zero at 1:6/)
  })
})

describe('parser', () => {
  it('handles unary minus below ^ and above *', () => {
    expect(run('-2 ^ 2')).toBe(-4)
    expect(run('2 * -3')).toBe(-6)
    expect(run('2 ^ -1')).toBe(0.5)
  })

  it('parses comparisons, logic and nested ternaries', () => {
    expect(run('1 < 2 && 2 <= 2 && 3 > 2 && 3 >= 3 && 1 == 1 && 1 != 2')).toBe(1)
    expect(run('!0')).toBe(1)
    expect(run('0 ? 1 : 0 ? 2 : 3')).toBe(3)
    expect(run('1 || 0 ? 10 : 20')).toBe(10)
  })

  it('parses let bodies greedily and supports shadowing', () => {
    expect(run('1 + let x = 2 in x * 3')).toBe(7)
    expect(run('let x = 1 in let x = x + 1 in x * 10')).toBe(20)
    expect(compile('let x = 1 in let x = 2 in x').names).toEqual(['x', 'x'])
  })

  it('calls builtins with arity checks', () => {
    expect(run('min(3, 1, 2) + max(4, 9) + abs(-2) + sqrt(16)')).toBe(16)
    expect(() => compile('sqrt(1, 2)')).toThrow(/sqrt expects 1 argument, got 2 at 1:1/)
    expect(() => compile('foo(1)')).toThrow(/Unknown function 'foo' at 1:1/)
  })

  it('reports syntax errors with positions', () => {
    expect(() => compile('1 +')).toThrow(/Unexpected end of input at 1:4/)
    expect(() => compile('(1 + 2')).toThrow(/Expected '\)' but found end of input/)
    expect(() => compile('1 $ 2')).toThrow(/Unexpected character '\$' at 1:3/)
    expect(() => compile('let = 3 in 1')).toThrow(/Expected 'ident' but found '='/)
  })
})

describe('compiler and vm', () => {
  it('short-circuits && and || with backpatched jumps', () => {
    expect(compile('a && b').disassemble()).toEqual(['LOAD a', 'DUP', 'JZ 0x0009', 'POP', 'LOAD b', 'RET'])
    expect(run('0 && 10 / 0')).toBe(0)
    expect(run('1 || 10 / 0')).toBe(1)
    expect(run('2 && 5')).toBe(5)
  })

  it('emits ternary as JZ / JMP with correct targets', () => {
    expect(compile('1 ? 2 : 3').disassemble()).toEqual([
      'PUSH 1',
      'JZ 0x000a',
      'PUSH 2',
      'JMP 0x000c',
      'PUSH 3',
      'RET',
    ])
    expect(run('0 ? 2 : 3')).toBe(3)
  })

  it('dedupes the constant pool and encodes calls as fn/argc', () => {
    const p = compile('min(2, 2, 3)')
    expect(p.constants).toEqual([2, 3])
    expect(p.disassemble()).toEqual(['PUSH 2', 'PUSH 2', 'PUSH 3', 'CALL min/3', 'RET'])
    expect(p.hex()).toBe('01 00 01 00 01 01 40 00 03 ff')
  })

  it('folds everything but division by zero', () => {
    expect(compile('1 + 2 * 3', { fold: true }).disassemble()).toEqual(['PUSH 7', 'RET'])
    expect(compile('max(1, 2) > 1 ? -3 : 4', { fold: true }).disassemble()).toEqual(['PUSH -3', 'RET'])
    expect(compile('let x = 1 in x', { fold: true }).disassemble()).toEqual(['PUSH 1', 'STORE x', 'LOAD x', 'RET'])
    expect(() => run('1 / 0', { fold: true })).toThrow(/Division by zero at 1:5/)
  })

  it('reports unknown identifiers at runtime with a span', () => {
    expect(() => run('2 * 3 + x')).toThrow(/Unknown identifier 'x' at 1:9/)
    expect(() => run('let y = 2 in\n  y + zz')).toThrow(/Unknown identifier 'zz' at 2:7/)
  })

  it('attaches source spans to every instruction', () => {
    const spans = compile('10 / (5 - 5)')
      .instructions()
      .map((i) => [i.text, i.span.start, i.span.end])
    expect(spans).toEqual([
      ['PUSH 10', 0, 2],
      ['PUSH 5', 6, 7],
      ['PUSH 5', 10, 11],
      ['SUB', 5, 12],
      ['DIV', 5, 12],
      ['RET', 0, 12],
    ])
  })
})

describe('trace', () => {
  it('yields a snapshot per step with stack, locals and result', () => {
    const steps = [...trace(compile('let x = 3 in x * (x + 1)'))]
    expect(steps[0]).toMatchObject({ pc: 0, step: 0, stack: [], locals: [null], done: false })
    expect(steps[2]).toMatchObject({ pc: 4, stack: [], locals: [3] })
    expect(steps.map((s) => s.stack)).toEqual([[], [3], [], [3], [3, 3], [3, 3, 1], [3, 4], [12], []])
    expect(steps.at(-1)).toMatchObject({ done: true, result: 12, error: null })
  })

  it('gives every push a fresh id so the UI can animate', () => {
    const steps = [...trace(compile('1 + 2'))]
    expect(steps[2].ids).toEqual([1, 2])
    expect(steps[3].ids).toEqual([3])
  })

  it('captures runtime errors as the final snapshot', () => {
    const steps = [...trace(compile('1 + x'))]
    const last = steps.at(-1)!
    expect(last.done).toBe(true)
    expect(last.error?.message).toBe("Unknown identifier 'x' at 1:5")
    expect(last.pc).toBe(2)
  })
})
