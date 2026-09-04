import { useEffect, useState } from "react";
import { activateVersion, listVersions, publishVersion, type VersionSummary } from "../api/client";

const DEFAULT_FUNNEL_KEY = "fitness-onboarding";

export function AdminPage() {
  const [funnelKey, setFunnelKey] = useState(DEFAULT_FUNNEL_KEY);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [configText, setConfigText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setVersions(await listVersions(funnelKey));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelKey]);

  async function handlePublish() {
    setMessage(null);
    let config: unknown;
    try {
      config = JSON.parse(configText);
    } catch {
      setMessage("Invalid JSON");
      return;
    }
    try {
      const version = await publishVersion(funnelKey, config);
      setMessage(`Published version ${version.version} (now active)`);
      setConfigText("");
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleActivate(version: number) {
    setMessage(null);
    try {
      await activateVersion(funnelKey, version);
      setMessage(`Version ${version} is now active`);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="admin-page">
      <h1>Funnel admin</h1>

      <label>
        Funnel key
        <input value={funnelKey} onChange={(e) => setFunnelKey(e.target.value)} />
      </label>

      <h2>Versions</h2>
      {loading && <p>Loading…</p>}
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Status</th>
            <th>Published at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.version}>
              <td>{v.version}</td>
              <td>{v.status}</td>
              <td>{v.publishedAt ?? "—"}</td>
              <td>
                {v.status !== "active" && (
                  <button onClick={() => handleActivate(v.version)}>Activate / rollback</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Publish new version</h2>
      <p className="subtitle">Paste a full funnel config JSON (see /configs in the repo for examples).</p>
      <textarea
        rows={16}
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        placeholder='{ "key": "...", "name": "...", "entryStepId": "...", "steps": [...] }'
      />
      <button className="primary" onClick={handlePublish}>
        Publish
      </button>

      {message && <p className="message">{message}</p>}
    </div>
  );
}
