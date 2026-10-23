import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../store/auth";
import { portalFor } from "../lib/portal";
import { LoadingBlock } from "./ui";

export function Protected({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingBlock label="Checking session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={portalFor(user.role)} replace />;
  }
  return <>{children}</>;
}
