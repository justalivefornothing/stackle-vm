# Stackle — plan

An expression language compiled to bytecode for a tiny stack VM, with
side-by-side source, disassembly, and a step debugger showing the operand stack.

## Goal

Type `let x = 3 in x * (x + 1)` and watch the disassembly update live. Press
**Step** and the highlighted instruction advances while the operand stack
animates values being pushed and popped. Everything — tokenizer, parser,
code generator, optimizer, VM — is written from scratch with no dependencies.

## Features

- Pratt parser: `+ - * / % ^`, unary minus, comparisons, `&& || !`, ternary
  `?:`, `let x = e in body`, calls to `min max abs sqrt`.
- Compiler emits bytecode into a `Uint8Array` with a constant pool:
  `PUSH LOAD STORE POP DUP ADD SUB MUL DIV MOD POW NEG NOT EQ NE LT LE GT GE
  JMP JZ CALL RET`. Jump targets for ternary / short-circuit are backpatched.
- Disassembler: address, mnemonic, resolved operand, and the source span each
  instruction came from.
- Step debugger: step / back / run / reset, current instruction highlight,
  operand stack column, locals table.
- Constant-folding optimizer toggle with before/after instruction-count diff.
- Runtime errors (division by zero, unknown identifier) carry a source span and
  are highlighted in the editor.
- Bytecode hex dump with a copy button.
- Gallery of example programs including a short-circuit demo.

## Architecture

```
source ──tokenize──▶ tokens ──parse (Pratt)──▶ AST ──fold?──▶ AST
                                                            │
                                                         codegen
                                                            ▼
                    Program { code: Uint8Array, constants[], names[], spans[] }
                                                            │
                          ┌─────────────────────────────────┤
                          ▼                                 ▼
                    disassemble()                    VM.step() loop
                    hexDump()                        trace() generator ─▶ React
```

- `src/lang/tokens.ts`   tokenizer, `Span`, line/col helpers
- `src/lang/parser.ts`   AST types + Pratt parser with binding powers
- `src/lang/fold.ts`     constant folding over the AST
- `src/lang/compiler.ts` opcodes, `Program`, single-pass codegen, disassembler
- `src/lang/vm.ts`       fetch-decode-execute loop, `run`, `trace` generator
- `src/lang/index.ts`    public API: `compile(src, {fold})`, `run(src)`
- `src/components/*`     Source / Bytecode / Stack panels, hex dump, gallery

Scoping: each `let` allocates a fresh local slot; a scope chain maps names to
slots at compile time. Free identifiers still get a slot so `LOAD x` compiles,
and reading an unbound slot at runtime raises `Unknown identifier 'x' at L:C`.

## Milestones

1. Plan, license, scaffold (vite + react-ts + tailwind v4 + vitest).
2. Core: tokenizer, parser, compiler, VM, tests green.
3. Debugger trace generator + three-column UI.
4. Optimizer toggle, hex dump, error spans, gallery.
5. Build, smoke test, screenshot, README, publish.
