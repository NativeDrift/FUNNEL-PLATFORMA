import { useState } from "react";
import type { Step } from "@funnel/shared";

interface Props {
  step: Step;
  onSubmit: (value: string | string[] | number) => void;
  onCta: () => void;
  submitting: boolean;
  error: string | null;
}

export function StepRenderer({ step, onSubmit, onCta, submitting, error }: Props) {
  switch (step.type) {
    case "single-select":
      return (
        <div className="step">
          <h2>{step.title}</h2>
          {step.subtitle && <p className="subtitle">{step.subtitle}</p>}
          <div className="options">
            {step.options.map((opt) => (
              <button
                key={opt.id}
                className="option"
                disabled={submitting}
                onClick={() => onSubmit(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      );

    case "multi-select":
      return <MultiSelectStep step={step} onSubmit={onSubmit} submitting={submitting} error={error} />;

    case "number":
      return <NumberStepView step={step} onSubmit={onSubmit} submitting={submitting} error={error} />;

    case "info":
      return (
        <div className="step">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          <button className="primary" disabled={submitting} onClick={() => onSubmit("seen")}>
            {step.ctaLabel ?? "Continue"}
          </button>
        </div>
      );

    case "result":
      return (
        <div className="step">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          <button className="primary" disabled={submitting} onClick={onCta}>
            {step.ctaLabel}
          </button>
        </div>
      );

    default:
      return null;
  }
}

function MultiSelectStep({
  step,
  onSubmit,
  submitting,
  error,
}: {
  step: Extract<Step, { type: "multi-select" }>;
  onSubmit: (value: string[]) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(value: string) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <div className="step">
      <h2>{step.title}</h2>
      {step.subtitle && <p className="subtitle">{step.subtitle}</p>}
      <div className="options">
        {step.options.map((opt) => (
          <label key={opt.id} className={`option checkbox ${selected.includes(opt.value) ? "selected" : ""}`}>
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={submitting} onClick={() => onSubmit(selected)}>
        Continue
      </button>
    </div>
  );
}

function NumberStepView({
  step,
  onSubmit,
  submitting,
  error,
}: {
  step: Extract<Step, { type: "number" }>;
  onSubmit: (value: number) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="step">
      <h2>{step.title}</h2>
      {step.subtitle && <p className="subtitle">{step.subtitle}</p>}
      <input
        type="number"
        className="number-input"
        placeholder={step.placeholder}
        min={step.min}
        max={step.max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={submitting || value === ""} onClick={() => onSubmit(Number(value))}>
        Continue
      </button>
    </div>
  );
}
