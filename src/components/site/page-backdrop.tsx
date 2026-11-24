/**
 * The site background: the home page's logo grid + the one glow + a few pixel blocks. Decorative,
 * static. The one background for every page, public, members and admin (user and manager, 25.11),
 * so it's rendered once, in the locale layout, behind the header and the page; pages don't add
 * their own. The parent (the layout's wrapper) is `relative isolate`.
 */
export function PageBackdrop() {
  return (
    <div aria-hidden data-testid="site-backdrop" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] overflow-hidden">
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
