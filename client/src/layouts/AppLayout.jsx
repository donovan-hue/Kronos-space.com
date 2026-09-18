import { Outlet } from "react-router-dom";
import FloatingNavigation from "../components/FloatingNavigation";
import MobileNavigation from "../components/MobileNavigation";
import Navigation from "../components/Navigation";
import TopBar from "../components/TopBar";

export default function AppLayout({ user }) {
  return <div className="k-app-shell">
    <TopBar user={user} />
    <Navigation />
    <main className="k-main-content"><Outlet /></main>
    <MobileNavigation />
    <FloatingNavigation />
  </div>;
}
