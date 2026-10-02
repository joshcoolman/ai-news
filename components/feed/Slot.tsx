/** A placeholder in the grid while a creator feed or story lane is still working. */
export function Slot({ label, activity }: { label: string; activity?: string }) {
  return (
    <div className="card slot" aria-busy="true">
      <div className="thumb skeleton">
        <span className="slot-label">{label}</span>
      </div>
      <div className="skeleton-line" />
      <div className="meta slot-activity">{activity ?? " "}</div>
    </div>
  );
}
