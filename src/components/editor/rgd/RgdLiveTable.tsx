import {
  flattenRgdTable,
  type RgdMechanicNode,
} from "./rgdTableModel";

type RgdLiveTableProps = {
  /** Gameplay / sheet name — table title (no section numbers). */
  title: string;
  mechanics: RgdMechanicNode[];
  className?: string;
};

/**
 * Live RGD matrix: Mechanic (+ optional input) → Skill → Parameter → Case,
 * with rowspan hierarchy matching the reference table.
 */
export function RgdLiveTable({
  title,
  mechanics,
  className,
}: RgdLiveTableProps) {
  const rows = flattenRgdTable(mechanics);
  const empty = rows.every(
    (r) =>
      !r.mechanic?.name.trim() &&
      !r.skill?.name.trim() &&
      !r.parameter.name.trim() &&
      !r.parameter.caseText.trim(),
  );

  return (
    <div className={className ? `rgd-live-table ${className}` : "rgd-live-table"}>
      <h3 className="rgd-live-table-title">{title || "Untitled gameplay"}</h3>
      {empty ? (
        <p className="muted tiny rgd-live-table-empty">
          No mechanics yet — edit this sheet under the RGD tab.
        </p>
      ) : (
        <div className="rgd-live-table-scroll">
          <table className="rgd-matrix">
            <thead>
              <tr>
                <th scope="col">Mechanic, system or interaction</th>
                <th scope="col">Player skill</th>
                <th scope="col">Atomic parameter(s)</th>
                <th scope="col">Case(s)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  {row.showMechanic && row.mechanic && (
                    <td
                      className="rgd-matrix-mechanic"
                      rowSpan={row.mechanicRowspan}
                    >
                      <span className="rgd-matrix-mechanic-name">
                        {row.mechanic.name.trim() || "—"}
                      </span>
                      {row.mechanic.playerInput.trim() ? (
                        <span className="rgd-matrix-input">
                          {row.mechanic.playerInput.trim()}
                        </span>
                      ) : null}
                    </td>
                  )}
                  {row.showSkill && row.skill && (
                    <td
                      className="rgd-matrix-skill"
                      rowSpan={row.skillRowspan}
                    >
                      {row.skill.name.trim() || "—"}
                    </td>
                  )}
                  <td className="rgd-matrix-param">
                    {row.parameter.name.trim() || "—"}
                  </td>
                  <td className="rgd-matrix-case">
                    {row.parameter.caseText.trim() || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
