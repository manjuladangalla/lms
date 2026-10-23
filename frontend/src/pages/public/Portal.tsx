import { Link } from "react-router-dom";
import { GraduationCap, Users } from "lucide-react";
import { Card } from "../../components/ui";
import { useAuth } from "../../store/auth";
import { portalFor } from "../../lib/portal";
import { HeroDecor } from "../../components/HeroDecor";

export default function Portal() {
  const { user, settings } = useAuth();

  return (
    <div className="relative overflow-hidden py-16">
      <HeroDecor variant="soft" />
      <div className="container-x relative">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Student Portal</h1>
          <p className="mt-3 text-muted">
            Choose how you want to sign in to {settings?.site_name || "the platform"}.
          </p>
        </div>

        {user && (
          <div className="mx-auto mt-8 max-w-md text-center">
            <Card className="p-6">
              <p className="text-sm text-muted">
                You are signed in as <b>{user.name}</b>.
              </p>
              <Link to={portalFor(user.role)} className="btn-primary mt-4 inline-flex">
                Go to my dashboard
              </Link>
            </Card>
          </div>
        )}

        <div className="mx-auto mt-10 grid max-w-2xl gap-6 sm:grid-cols-2">
          <Card className="flex flex-col items-center p-8 text-center transition hover:border-primary hover:shadow-lg">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-xl font-bold">I'm a Student</h2>
            <p className="mt-2 text-sm text-muted">
              Access your courses, lessons, exams, and certificates.
            </p>
            <Link to="/login" className="btn-primary mt-6 w-full">
              Student Login
            </Link>
          </Card>

          <Card className="flex flex-col items-center p-8 text-center transition hover:border-primary hover:shadow-lg">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary2/10 text-primary2">
              <Users className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-xl font-bold">I'm a Parent</h2>
            <p className="mt-2 text-sm text-muted">
              Track your child's progress and enrol them in programmes.
            </p>
            <Link to="/login?portal=parent" className="btn-primary mt-6 w-full">
              Parent Login
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
