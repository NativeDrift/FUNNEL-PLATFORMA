interface Props {
  visited: number;
  likelyTotal: number;
}

export function ProgressBar({ visited, likelyTotal }: Props) {
  const pct = likelyTotal > 0 ? Math.min(100, Math.round((visited / likelyTotal) * 100)) : 0;
  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
