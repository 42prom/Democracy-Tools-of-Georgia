import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { authApi } from './api/client';

const Layout = lazy(() => import('./components/Layout'));
const SettingsLayout = lazy(() => import('./components/SettingsLayout'));
const CreatePoll = lazy(() => import('./pages/CreatePoll'));
const DraftedPolls = lazy(() => import('./pages/DraftedPolls'));
const ActivePolls = lazy(() => import('./pages/ActivePolls'));
const VotingHistory = lazy(() => import('./pages/VotingHistory'));
const SettingsRegions = lazy(() => import('./pages/SettingsRegions'));
const SettingsVerificationProviders = lazy(() => import('./pages/SettingsVerificationProviders'));
const SettingsBlockchain = lazy(() => import('./pages/SettingsBlockchain'));
const SettingsSecurity = lazy(() => import('./pages/SettingsSecurity'));
const SettingsNotifications = lazy(() => import('./pages/SettingsNotifications'));
const SettingsGeoBlocking = lazy(() => import('./pages/SettingsGeoBlocking'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SecurityLogs = lazy(() => import('./pages/SecurityLogs'));
const PollDetails = lazy(() => import('./pages/PollDetails'));
const Insights = lazy(() => import('./pages/Insights'));
const Profiles = lazy(() => import('./pages/Profiles'));
const MessagesList = lazy(() => import('./pages/MessagesList'));
const MessageEditor = lazy(() => import('./pages/MessageEditor'));
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const ShieldDashboard = lazy(() => import('./pages/ShieldDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));

type AuthStatus = 'checking' | 'authenticated' | 'guest';

function RequireAdmin({ children, status }: { children: React.ReactNode; status: AuthStatus }) {
  if (status === 'checking') {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Checking secure session…</div>;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');

  useEffect(() => {
    authApi.me()
      .then(response => {
        sessionStorage.setItem('admin_csrf', response.csrfToken);
        sessionStorage.setItem('admin_user', JSON.stringify(response.user));
        setAuthStatus('authenticated');
      })
      .catch(() => setAuthStatus('guest'));
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading secure console…</div>}>
        <Routes>
        {/* Login route */}
        <Route path="/login" element={<Login onLogin={() => setAuthStatus('authenticated')} />} />

        {/* Protected admin routes */}
        <Route
          path="/"
          element={
            <RequireAdmin status={authStatus}>
              <Layout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="create-poll" element={<CreatePoll />} />
          <Route path="drafts" element={<DraftedPolls />} />
          <Route path="active" element={<ActivePolls />} />
          <Route path="polls/:id" element={<PollDetails />} />
          <Route path="polls/:id/edit" element={<CreatePoll />} />
          <Route path="history" element={<VotingHistory />} />
          <Route path="insights" element={<Insights />} />
          <Route path="profiles" element={<Profiles />} />
          <Route path="messages" element={<MessagesList />} />
          <Route path="messages/create" element={<MessageEditor />} />
          <Route path="messages/:id/edit" element={<MessageEditor />} />
          <Route path="logs" element={<SecurityLogs />} />
          <Route path="shield" element={<ShieldDashboard />} />
          <Route path="admin-users" element={<AdminUsers />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />

          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/blockchain" replace />} />
            <Route path="regions" element={<SettingsRegions />} />
            <Route path="verification-providers" element={<SettingsVerificationProviders />} />
            <Route path="blockchain" element={<SettingsBlockchain />} />
            <Route path="security" element={<SettingsSecurity />} />
            <Route path="notifications" element={<SettingsNotifications />} />
            <Route path="geo-blocking" element={<SettingsGeoBlocking />} />
          </Route>
        </Route>

        {/* fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
