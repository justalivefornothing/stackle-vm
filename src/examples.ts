export interface Example {
  name: string
  source: string
  blurb: string
}

export const EXAMPLES: Example[] = [
  {
    name: 'let-in',
    source: 'let x = 3 in x * (x + 1)',
    blurb: 'A binding stored to a local slot, then loaded twice.',
  },
  {
    name: 'precedence',
    source: '1 + 2 * 3 ^ 2',
    blurb: '^ binds tightest and is right-associative; the Pratt parser sorts it out.',
  },
  {
    name: 'ternary',
    source: 'let n = 7 in n % 2 == 0 ? n / 2 : 3 * n + 1',
    blurb: 'One Collatz step. JZ skips the then-branch, JMP skips the else-branch.',
  },
  {
    name: 'short-circuit',
    source: 'let x = 0 in x != 0 && 10 / x > 1',
    blurb: 'DUP + JZ keep the left value and jump over the division, so 10 / 0 never runs.',
  },
  {
    name: 'builtins',
    source: 'min(abs(-7), sqrt(81), max(2, 5))',
    blurb: 'CALL takes a function index and an argument count.',
  },
  {
    name: 'fold me',
    source: '(2 + 3) * (10 - 4) / max(1, 2)',
    blurb: 'Every leaf is a literal: toggle folding and watch 10 instructions become 2.',
  },
  {
    name: 'shadowing',
    source: 'let x = 1 in let x = x + 1 in x * 10',
    blurb: 'Each let gets its own slot; the inner x shadows the outer one.',
  },
  {
    name: 'div by zero',
    source: 'let d = 2 - 2 in 100 / d',
    blurb: 'A runtime fault that points back at the divisor in the source.',
  },
  {
    name: 'unbound',
    source: '2 * 3 + x',
    blurb: 'Free identifiers still compile to LOAD; reading one at runtime is an error.',
  },
]
