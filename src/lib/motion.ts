// Motion tokens (design/motion-spec.md §1). CSS mirrors live in src/app/tokens.css.
export const ease = {
  /** ease-out-quint: entrances and reveals */
  out: [0.22, 1, 0.36, 1],
  /** things moving while on screen (rare) */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const dur = {
  press: 0.1,
  hover: 0.15,
  ui: 0.25,
  intro: 0.6,
  reveal: 0.55,
} as const;

export const distance = { intro: 10, reveal: 12 } as const;

/** Rows entering together cascade by this much; resets every 3 so long scrolls never pile up delay. */
export const revealStagger = 0.05;
