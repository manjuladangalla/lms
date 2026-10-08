import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../store/auth";
import { LoadingBlock } from "./ui";

export function Protected({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingBlock label="Checking session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) {
    const staff = ["admin", "lecturer", "counselor"];
    return <Navigate to={staff.includes(user.role) ? "/admin" : "/dashboard"} replace />;
  }
  return <>{children}</>;
}
