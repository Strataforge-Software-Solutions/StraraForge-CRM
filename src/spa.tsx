import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, ToastProvider, Gate, Shell, useAuth } from "./crm/shared";
import { Dashboard } from "./crm/dashboard";
import { Leads, LeadWorkflow } from "./crm/leads";
import { TasksDeals } from "./crm/tasks-deals";
import { Pipeline } from "./crm/pipeline";
import { Clients, ClientDetail } from "./crm/clients";
import { Projects } from "./crm/projects";
import { Settings, Security, MfaPage, AuthPage, Setup, AccessPending, AuthCallback } from "./crm/account";
import ProjectDetail from "@/ProjectDetail";
import TeamProjectTasks from "@/TeamProjectTasks";
import CalendarPage from "@/Calendar";
import ReportsPage from "@/Reports";

function Calendar() {
  const { founder } = useAuth();
  return <CalendarPage workspaceId={founder!.workspaceId} />;
}

function Reports() {
  const { founder } = useAuth();
  return <ReportsPage workspaceId={founder!.workspaceId} userId={founder!.userId} />;
}

function NotFound() {
  return <div className="empty-state"><h1>Page not found</h1><Link to="/dashboard">Return to dashboard</Link></div>;
}

function App() {
  return <AuthProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
          <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="/set-password" element={<AuthPage mode="set-password" />} />
          <Route path="/access-pending" element={<AccessPending />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/confirm" element={<AuthCallback />} />
          <Route path="/auth/invite-callback" element={<AuthCallback />} />
          <Route path="/auth/invite-callback/auth/confirm" element={<AuthCallback />} />
          <Route element={<Gate />}>
            <Route path="/verify" element={<MfaPage />} />
            <Route element={<Shell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/leads/new" element={<Leads />} />
              <Route path="/leads/:id" element={<LeadWorkflow />} />
              <Route path="/leads/:id/*" element={<LeadWorkflow />} />
              <Route path="/team/tasks" element={<TeamProjectTasks />} />
              <Route path="/tasks-deals" element={<TasksDeals />} />
              <Route path="/tasks" element={<TasksDeals />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/new" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/account" element={<Security />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </AuthProvider>;
}
export default App;
