import { Routes, Route, Navigate } from "react-router-dom";
import { Navbar, Footer } from "./components/layout";
import { Protected } from "./components/Protected";
import Home from "./pages/public/Home";
import About from "./pages/public/About";
import Catalog from "./pages/public/Catalog";
import ProgrammeDetail from "./pages/public/ProgrammeDetail";
import Memberships from "./pages/public/Memberships";
import Counselling from "./pages/public/Counselling";
import Contact from "./pages/public/Contact";
import Verify from "./pages/public/Verify";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import VerifyOtp from "./pages/auth/VerifyOtp";
import StudentDashboard from "./pages/student/Dashboard";
import Learn from "./pages/student/Learn";
import Exams from "./pages/student/Exams";
import TakeExam from "./pages/student/TakeExam";
import Results from "./pages/student/Results";
import Certificates from "./pages/student/Certificates";
import Payments from "./pages/student/Payments";
import MembershipPage from "./pages/student/Membership";
import StudentAssignments from "./pages/student/Assignments";
import MyCounselling from "./pages/student/MyCounselling";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminProgrammes from "./pages/admin/Programmes";
import AdminProgrammeEdit from "./pages/admin/ProgrammeEdit";
import AdminEnrolments from "./pages/admin/Enrolments";
import AdminPayments from "./pages/admin/Payments";
import AdminStudents from "./pages/admin/Students";
import AdminGrading from "./pages/admin/Grading";
import AdminResults from "./pages/admin/Results";
import AdminCertificates from "./pages/admin/Certificates";
import AdminPlans from "./pages/admin/Plans";
import AdminPromos from "./pages/admin/Promotions";
import AdminBanners from "./pages/admin/Banners";
import AdminCounselling from "./pages/admin/Counselling";
import AdminPages from "./pages/admin/Pages";
import AdminSettings from "./pages/admin/Settings";
import AdminSystem from "./pages/admin/System";
import AdminMessages from "./pages/admin/Messages";

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicShell><Home /></PublicShell>} />
      <Route path="/about" element={<PublicShell><About /></PublicShell>} />
      <Route path="/classes" element={<PublicShell><Catalog type="class" /></PublicShell>} />
      <Route path="/courses" element={<PublicShell><Catalog type="course" /></PublicShell>} />
      <Route path="/diploma" element={<PublicShell><Catalog type="diploma" /></PublicShell>} />
      <Route path="/programmes/:slug" element={<PublicShell><ProgrammeDetail /></PublicShell>} />
      <Route path="/memberships" element={<PublicShell><Memberships /></PublicShell>} />
      <Route path="/counselling" element={<PublicShell><Counselling /></PublicShell>} />
      <Route path="/contact" element={<PublicShell><Contact /></PublicShell>} />
      <Route path="/verify" element={<PublicShell><Verify /></PublicShell>} />
      <Route path="/verify/:certNo" element={<PublicShell><Verify /></PublicShell>} />
      <Route path="/login" element={<PublicShell><Login /></PublicShell>} />
      <Route path="/register" element={<PublicShell><Register /></PublicShell>} />
      <Route path="/verify-otp" element={<PublicShell><VerifyOtp /></PublicShell>} />

      <Route path="/dashboard" element={<Protected><StudentDashboard /></Protected>} />
      <Route path="/learn/:programmeId" element={<Protected><Learn /></Protected>} />
      <Route path="/dashboard/exams" element={<Protected><Exams /></Protected>} />
      <Route path="/dashboard/exams/:examId/take" element={<Protected><TakeExam /></Protected>} />
      <Route path="/dashboard/results" element={<Protected><Results /></Protected>} />
      <Route path="/dashboard/certificates" element={<Protected><Certificates /></Protected>} />
      <Route path="/dashboard/payments" element={<Protected><Payments /></Protected>} />
      <Route path="/dashboard/membership" element={<Protected><MembershipPage /></Protected>} />
      <Route path="/dashboard/assignments" element={<Protected><StudentAssignments /></Protected>} />
      <Route path="/dashboard/counselling" element={<Protected><MyCounselling /></Protected>} />

      <Route
        path="/admin/*"
        element={
          <Protected roles={["admin", "lecturer", "counselor"]}>
            <AdminLayout>
              <Routes>
                <Route index element={<AdminDashboard />} />
                <Route path="programmes" element={<AdminProgrammes />} />
                <Route path="programmes/:id" element={<AdminProgrammeEdit />} />
                <Route path="enrolments" element={<Protected roles={["admin"]}><AdminEnrolments /></Protected>} />
                <Route path="payments" element={<Protected roles={["admin"]}><AdminPayments /></Protected>} />
                <Route path="students" element={<Protected roles={["admin"]}><AdminStudents /></Protected>} />
                <Route path="grading" element={<AdminGrading />} />
                <Route path="results" element={<AdminResults />} />
                <Route path="certificates" element={<AdminCertificates />} />
                <Route path="plans" element={<Protected roles={["admin"]}><AdminPlans /></Protected>} />
                <Route path="promotions" element={<Protected roles={["admin"]}><AdminPromos /></Protected>} />
                <Route path="banners" element={<Protected roles={["admin"]}><AdminBanners /></Protected>} />
                <Route path="counselling" element={<Protected roles={["admin", "counselor"]}><AdminCounselling /></Protected>} />
                <Route path="pages" element={<Protected roles={["admin"]}><AdminPages /></Protected>} />
                <Route path="settings" element={<Protected roles={["admin"]}><AdminSettings /></Protected>} />
                <Route path="system" element={<Protected roles={["admin"]}><AdminSystem /></Protected>} />
                <Route path="messages" element={<Protected roles={["admin"]}><AdminMessages /></Protected>} />
              </Routes>
            </AdminLayout>
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
