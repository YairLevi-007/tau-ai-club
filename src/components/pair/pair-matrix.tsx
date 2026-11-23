import { panelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

type Person = { id: string; full_name: string };

/**
 * pAIr's who-met-whom grid (✓ met once, a number for more). On a phone the grid scrolls inside
 * its own box, never the page. The box is `relative` on purpose: each cell's screen-reader label is
 * `sr-only` (position: absolute), and without a positioned ancestor inside the box those labels were
 * placed against the page and pushed it 170px sideways at 390px (QA, pAIr PR 2, a6).
 */
export function PairMatrix({
  people,
  count,
  labels,
}: {
  people: Person[];
  count: (a: string, b: string) => number;
  labels: { caption: string; cell: (a: string, b: string, n: number) => string; cellNot: (a: string, b: string) => string };
}) {
  const first = (n: string) => n.split(/\s+/)[0];
  const stickyCell = "sticky start-0 z-10 border-b border-border bg-bg [background-image:linear-gradient(var(--surface),var(--surface))]";
  return (
    <div className={cn(panelClass, "relative max-w-full overflow-x-auto overscroll-x-contain")} data-testid="pair-matrix-scroll">
      <table className="border-separate border-spacing-0 text-sm" data-testid="pair-matrix">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr>
            <td className={stickyCell} />
            {people.map((p) => (
              <th key={p.id} scope="col" title={p.full_name} className="border-b border-border px-2 py-2.5 text-xs font-medium whitespace-nowrap text-fg-subtle">
                {first(p.full_name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((r) => (
            <tr key={r.id}>
              <th scope="row" className={cn(stickyCell, "px-3 py-2 text-start font-medium whitespace-nowrap text-fg")}>
                {r.full_name}
              </th>
              {people.map((c) => {
                if (r.id === c.id) return <td key={c.id} className="border-b border-border bg-bg-deep" aria-hidden />;
                const k = count(r.id, c.id);
                const label = k ? labels.cell(r.full_name, c.full_name, k) : labels.cellNot(r.full_name, c.full_name);
                return (
                  <td key={c.id} title={label} className={cn("border-b border-border px-2 py-2 text-center font-mono", k > 1 ? "bg-brand-purple text-on-purple" : k ? "bg-brand-purple/25 text-fg" : "")}>
                    <span aria-hidden>{k > 1 ? k : k ? "✓" : ""}</span>
                    <span className="sr-only">{label}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
