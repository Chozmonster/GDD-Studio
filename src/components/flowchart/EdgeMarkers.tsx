/** SVG marker defs for non-arrow connector ends (diamond / circle). */
export function EdgeMarkers() {
  return (
    <svg className="flow-marker-defs" aria-hidden="true">
      <defs>
        <marker
          id="gdd-marker-circle"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <circle cx="5" cy="5" r="3.2" fill="#c8c8c8" />
        </marker>
        <marker
          id="gdd-marker-diamond"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="#c8c8c8" />
        </marker>
      </defs>
    </svg>
  );
}
