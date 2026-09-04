import type { ResolvedResult } from "@funnel/shared";

interface Props {
  result: ResolvedResult;
  onCta: () => void;
  submitting: boolean;
}

export function ResultView({ result, onCta, submitting }: Props) {
  return (
    <div className="step">
      <h2>{result.title}</h2>
      <p>{result.summary}</p>
      {result.recommendations && result.recommendations.length > 0 && (
        <ul className="recommendations">
          {result.recommendations.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <button className="primary" disabled={submitting} onClick={onCta}>
        {result.cta.label}
      </button>
    </div>
  );
}
