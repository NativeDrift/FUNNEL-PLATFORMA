import { useEffect, useState } from "react";
import { getAnalytics, type AnalyticsResponse } from "../api/client";

const DEFAULT_FUNNEL_ID = "workstyle-planner";

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export function AnalyticsPage() {
  const [funnelId, setFunnelId] = useState(DEFAULT_FUNNEL_ID);
  const [utmCampaign, setUtmCampaign] = useState("");
  const [version, setVersion] = useState("");
  const [variant, setVariant] = useState("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const result = await getAnalytics({
        funnelId,
        version: version ? Number(version) : undefined,
        variant: variant === "A" || variant === "B" ? variant : undefined,
        utmCampaign: utmCampaign || undefined,
      });
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="analytics-page">
      <h1>Analytics</h1>

      <div className="filters">
        <label>
          Funnel ID
          <input value={funnelId} onChange={(e) => setFunnelId(e.target.value)} />
        </label>
        <label>
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="all" />
        </label>
        <label>
          Variant
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="">all</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label>
          UTM campaign
          <input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="any" />
        </label>
        <button className="primary" onClick={load}>
          Apply
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="stat-value">{data.sessionsStarted}</div>
              <div className="stat-label">Sessions started</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.resultReached}</div>
              <div className="stat-label">Reached result</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.ctaClicks}</div>
              <div className="stat-label">CTA clicks</div>
            </div>
            <div className="stat">
              <div className="stat-value">{pct(data.ctaCTR)}</div>
              <div className="stat-label">CTA CTR</div>
            </div>
          </div>

          <h2>Step funnel</h2>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Viewed (unique sessions)</th>
                <th>Completed</th>
                <th>Drop-off</th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map((s) => (
                <tr key={s.stepId}>
                  <td>{s.stepId}</td>
                  <td>{s.viewedSessions}</td>
                  <td>{s.completedSessions}</td>
                  <td>{s.dropOff}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>A vs B</h2>
          <table>
            <thead>
              <tr>
                <th>Variant</th>
                <th>Sessions</th>
                <th>Reached result</th>
                <th>CTA clicks</th>
                <th>CTA CTR</th>
              </tr>
            </thead>
            <tbody>
              {data.byVariant.map((v) => (
                <tr key={v.variant}>
                  <td>{v.variant}</td>
                  <td>{v.sessionsStarted}</td>
                  <td>{v.resultReached}</td>
                  <td>{v.ctaClicks}</td>
                  <td>{pct(v.ctaCTR)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>By version</h2>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Sessions</th>
                <th>Reached result</th>
                <th>CTA clicks</th>
                <th>CTA CTR</th>
              </tr>
            </thead>
            <tbody>
              {data.byVersion.map((v) => (
                <tr key={v.version}>
                  <td>{v.version}</td>
                  <td>{v.sessionsStarted}</td>
                  <td>{v.resultReached}</td>
                  <td>{v.ctaClicks}</td>
                  <td>{pct(v.ctaCTR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
