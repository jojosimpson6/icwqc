interface StatTableProps {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  highlightCol?: number;
}

export function StatTable({ title, headers, rows, highlightCol }: StatTableProps) {
  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-t border-border ${
                  ri % 2 === 1 ? "bg-table-stripe" : "bg-card"
                } hover:bg-highlight/20 transition-colors`}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-1.5 ${ci === 0 ? "text-left" : "text-right"} ${
                      ci === 0
                        ? "font-medium text-accent hover:underline cursor-pointer"
                        : "font-mono text-sm"
                    } ${highlightCol === ci ? "font-bold text-foreground" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
