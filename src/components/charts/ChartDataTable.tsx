import type { PushHistoryOptions } from "../../hooks/useHistoryStack";
import type { ChartDocument, ChartSeries } from "../../types";
import {
  newEntityId,
  parseNumericCell,
  parseXCell,
} from "./chartModel";

type ChartDataTableProps = {
  document: ChartDocument;
  onChange: (next: ChartDocument) => void;
  onBeforeChange: (opts?: PushHistoryOptions) => void;
};

export function ChartDataTable({
  document: doc,
  onChange,
  onBeforeChange,
}: ChartDataTableProps) {
  const updateSeriesName = (seriesId: string, name: string) => {
    onBeforeChange({ coalesce: true });
    onChange({
      ...doc,
      series: doc.series.map((s) =>
        s.id === seriesId ? { ...s, name } : s,
      ),
    });
  };

  const addSeries = () => {
    onBeforeChange();
    const id = newEntityId("series");
    const series: ChartSeries = {
      id,
      name: `Series ${doc.series.length + 1}`,
    };
    onChange({
      ...doc,
      series: [...doc.series, series],
      rows: doc.rows.map((r) => ({
        ...r,
        y: { ...r.y, [id]: null },
      })),
    });
  };

  const removeSeries = (seriesId: string) => {
    if (doc.series.length <= 1) return;
    onBeforeChange();
    onChange({
      ...doc,
      series: doc.series.filter((s) => s.id !== seriesId),
      rows: doc.rows.map((r) => {
        const y = { ...r.y };
        delete y[seriesId];
        return { ...r, y };
      }),
    });
  };

  const addRow = () => {
    onBeforeChange();
    const id = newEntityId("row");
    const lastX = doc.rows.length
      ? doc.rows[doc.rows.length - 1].x
      : 0;
    const nextX =
      typeof lastX === "number" ? lastX + 1 : doc.rows.length + 1;
    const y: Record<string, number | null> = {};
    for (const s of doc.series) y[s.id] = null;
    onChange({
      ...doc,
      rows: [...doc.rows, { id, x: nextX, y }],
    });
  };

  const removeRow = (rowId: string) => {
    onBeforeChange();
    onChange({
      ...doc,
      rows: doc.rows.filter((r) => r.id !== rowId),
    });
  };

  const setX = (rowId: string, raw: string) => {
    onBeforeChange({ coalesce: true });
    onChange({
      ...doc,
      rows: doc.rows.map((r) =>
        r.id === rowId ? { ...r, x: parseXCell(raw) } : r,
      ),
    });
  };

  const setY = (rowId: string, seriesId: string, raw: string) => {
    onBeforeChange({ coalesce: true });
    onChange({
      ...doc,
      rows: doc.rows.map((r) =>
        r.id === rowId
          ? { ...r, y: { ...r.y, [seriesId]: parseNumericCell(raw) } }
          : r,
      ),
    });
  };

  return (
    <div className="chart-data-table-wrap">
      <div className="chart-data-table-toolbar">
        <button type="button" className="ghost tiny-btn" onClick={addRow}>
          Add row
        </button>
        <button type="button" className="ghost tiny-btn" onClick={addSeries}>
          Add series
        </button>
      </div>
      <div className="chart-data-table-scroll">
        <table className="chart-data-table">
          <thead>
            <tr>
              <th scope="col">{doc.xLabel || "X"}</th>
              {doc.series.map((s) => (
                <th key={s.id} scope="col">
                  <input
                    className="chart-series-name-input"
                    value={s.name}
                    aria-label="Series name"
                    onChange={(e) => updateSeriesName(s.id, e.target.value)}
                  />
                  {doc.series.length > 1 && (
                    <button
                      type="button"
                      className="ghost tiny-btn chart-series-remove"
                      title="Remove series"
                      onClick={() => removeSeries(s.id)}
                    >
                      ×
                    </button>
                  )}
                </th>
              ))}
              <th scope="col" className="chart-row-actions-col">
                <span className="visually-hidden">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.rows.length === 0 ? (
              <tr>
                <td colSpan={doc.series.length + 2} className="muted tiny">
                  No rows yet — add a row or use Generate from formula.
                </td>
              </tr>
            ) : (
              doc.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      className="chart-cell-input"
                      value={String(row.x)}
                      aria-label="X value"
                      onChange={(e) => setX(row.id, e.target.value)}
                    />
                  </td>
                  {doc.series.map((s) => (
                    <td key={s.id}>
                      <input
                        className="chart-cell-input"
                        inputMode="decimal"
                        value={
                          row.y[s.id] === null || row.y[s.id] === undefined
                            ? ""
                            : String(row.y[s.id])
                        }
                        aria-label={`${s.name} value`}
                        onChange={(e) => setY(row.id, s.id, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="chart-row-actions-col">
                    <button
                      type="button"
                      className="ghost tiny-btn"
                      title="Delete row"
                      onClick={() => removeRow(row.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
