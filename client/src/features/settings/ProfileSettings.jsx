import { Navigate } from "react-router-dom";

// Preserve saved URLs while keeping the actual controls in one Settings screen.
export default function ProfileSettings() {
  return <Navigate replace to="/settings#privacy" />;
}
