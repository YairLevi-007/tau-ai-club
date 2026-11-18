/**
 * The home page's backdrop: logo grid + the one glow + a few pixel blocks. Decorative, static.
 * Used on the home page and in the personal area (/me, /profile), which the user wants in the
 * same colours (docs/DECISIONS.md). The parent needs `relative isolate`.
 */
export function PageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-[46rem] overflow-hidden">
      <div className="hero-grid absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
      <i className="absolute hidden lg:block start-[6%] top-[11rem] size-7 bg-logo-indigo" />
      <i className="absolute hidden lg:block start-[calc(6%+1.75rem)] top-[12.75rem] size-7 bg-logo-block" />
      <i className="absolute end-[12%] top-[9.5rem] size-3.5 bg-brand-purple" />
      <i className="absolute hidden lg:block end-[4%] top-[22rem] size-7 bg-logo-indigo" />
      <i className="absolute hidden lg:block end-[calc(4%+1.75rem)] top-[24rem] size-3.5 bg-logo-block" />
    </div>
  );
}
