import { useState } from "react";
import type { StepDef } from "@funnel/shared";

interface Props {
  step: StepDef;
  onSubmit: (value: string | string[] | number) => void;
  submitting: boolean;
  error: string | null;
}

export function StepRenderer({ step, onSubmit, submitting, error }: Props) {
  switch (step.type) {
    case "single-select":
      return (
        <div className="step">
          {step.content.eyebrow && <div className="eyebrow">{step.content.eyebrow}</div>}
          <h2>{step.content.title}</h2>
          {step.content.helperText && <p className="subtitle">{step.content.helperText}</p>}
          <div className="options">
            {step.input.options.map((opt) => (
              <button key={opt.value} className="option" disabled={submitting} onClick={() => onSubmit(opt.value)}>
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
          {step.content.eyebrow && <div className="eyebrow">{step.content.eyebrow}</div>}
          <h2>{step.content.title}</h2>
          {step.content.body && <p>{step.content.body}</p>}
          <button className="primary" disabled={submitting} onClick={() => onSubmit("seen")}>
            {step.content.primaryActionLabel ?? "Continue"}
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
  step: Extract<StepDef, { type: "multi-select" }>;
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
      {step.content.eyebrow && <div className="eyebrow">{step.content.eyebrow}</div>}
      <h2>{step.content.title}</h2>
      {step.content.helperText && <p className="subtitle">{step.content.helperText}</p>}
      <div className="options">
        {step.input.options.map((opt) => (
          <label key={opt.value} className={`option checkbox ${selected.includes(opt.value) ? "selected" : ""}`}>
            <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
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
  step: Extract<StepDef, { type: "number" }>;
  onSubmit: (value: number) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="step">
      {step.content.eyebrow && <div className="eyebrow">{step.content.eyebrow}</div>}
      <h2>{step.content.title}</h2>
      {step.content.helperText && <p className="subtitle">{step.content.helperText}</p>}
      <div className="number-field">
        <input
          type="number"
          className="number-input"
          min={step.input.min}
          max={step.input.max}
          step={step.input.step ?? 1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {step.input.unit && <span className="number-unit">{step.input.unit}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={submitting || value === ""} onClick={() => onSubmit(Number(value))}>
        Continue
      </button>
    </div>
  );
}
