interface Props {
  visited: number;
  total: number;
}

export function ProgressBar({ visited, total }: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
