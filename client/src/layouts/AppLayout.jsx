import { Outlet } from "react-router-dom";
import FanNav from "../components/FanNav";
import TopBar from "../components/TopBar";
import OfflineNotice from "../components/feedback/OfflineNotice";

export default function AppLayout() {
  return (
    <div className="k-app-shell k-app-shell-fan">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <TopBar />
      <main id="main-content" className="k-main-content" tabIndex="-1">
        <Outlet />
      </main>
      <FanNav />
    </div>
  );
}
