import { Link, Route, Routes } from "react-router-dom";
import { FunnelPage } from "./pages/FunnelPage";
import { AdminPage } from "./pages/AdminPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

export function App() {
  return (
    <div className="app">
      <nav className="top-nav">
        <Link to="/">Funnel</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/analytics">Analytics</Link>
      </nav>
      <Routes>
        <Route path="/" element={<FunnelPage />} />
        <Route path="/f/:funnelId" element={<FunnelPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </div>
  );
}
