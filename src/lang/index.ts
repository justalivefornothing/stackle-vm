import { fold } from './fold'
import { generate, type Program } from './compiler'
import { parse } from './parser'
import { tokenize } from './tokens'
import { execute } from './vm'

export interface CompileOptions {
  /** Run the constant-folding pass over the AST before code generation. */
  fold?: boolean
}

/** Source -> tokens -> AST -> (fold) -> bytecode `Program`. */
export function compile(source: string, opts: CompileOptions = {}): Program {
  let ast = parse(tokenize(source), source)
  if (opts.fold) ast = fold(ast)
  return generate(ast, source)
}

/** Compile and run, returning the number left on the operand stack. */
export function run(source: string, opts?: CompileOptions): number {
  return execute(compile(source, opts))
}

export { Program, Op, OP_NAME, fmtAddr, fmtNum, type Instruction } from './compiler'
export { StackleError, lineCol, type Span } from './tokens'
export { trace, type Snapshot } from './vm'
export { BUILTINS } from './builtins'
