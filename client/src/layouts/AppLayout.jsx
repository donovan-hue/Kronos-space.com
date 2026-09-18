import { Outlet } from "react-router-dom";
import MobileNavigation from "../components/MobileNavigation";
import Navigation from "../components/Navigation";
import TopBar from "../components/TopBar";
import OfflineNotice from "../components/feedback/OfflineNotice";

export default function AppLayout({ user }) {
  return (
    <div className="k-app-shell">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <TopBar user={user} />
      <Navigation />
      <main id="main-content" className="k-main-content" tabIndex="-1">
        <Outlet />
      </main>
      <MobileNavigation />
    </div>
  );
}
