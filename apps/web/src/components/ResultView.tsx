import { useState } from "react";
import type { ResolvedResult } from "@funnel/shared";

interface Props {
  result: ResolvedResult;
  onCta: () => void;
  submitting: boolean;
}

export function ResultView({ result, onCta, submitting }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasRecommendations = !!result.recommendations && result.recommendations.length > 0;

  function handleClick() {
    onCta();
    if (hasRecommendations) setExpanded(true);
  }

  return (
    <div className="step">
      <h2>{result.title}</h2>
      <p>{result.summary}</p>

      {expanded && hasRecommendations && (
        <ul className="recommendations">
          {result.recommendations!.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {!expanded || !hasRecommendations ? (
        <button className="primary" disabled={submitting} onClick={handleClick}>
          {result.cta.label}
        </button>
      ) : (
        <p className="cta-done">✓ Added to your action list</p>
      )}
    </div>
  );
}
