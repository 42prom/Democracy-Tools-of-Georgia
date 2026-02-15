import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import SettingsLayout from './components/SettingsLayout';

import Login from './pages/Login';
import CreatePoll from './pages/CreatePoll';
import DraftedPolls from './pages/DraftedPolls';
import ActivePolls from './pages/ActivePolls';
import VotingHistory from './pages/VotingHistory';
import SettingsRegions from './pages/SettingsRegions';
import SettingsVerificationProviders from './pages/SettingsVerificationProviders';
import SettingsBlockchain from './pages/SettingsBlockchain';
import SettingsSecurity from './pages/SettingsSecurity';
import SettingsNotifications from './pages/SettingsNotifications';
import Dashboard from './pages/Dashboard';
import SecurityLogs from './pages/SecurityLogs';
import PollDetails from './pages/PollDetails';
import Insights from './pages/Insights';
import Profiles from './pages/Profiles';
import MessagesList from './pages/MessagesList';
import MessageEditor from './pages/MessageEditor';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';

function hasAdminToken() {
  return !!(localStorage.getItem('admin_token') ?? localStorage.getItem('adminToken'));
}

function RequireAdmin({ children, isAuthed }: { children: React.ReactNode; isAuthed: boolean }) {
  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  const [isAuthed, setIsAuthed] = useState(hasAdminToken());

  return (
    <BrowserRouter>
      <Routes>
        {/* Login route */}
        <Route path="/login" element={<Login onLogin={() => setIsAuthed(true)} />} />

        {/* Protected admin routes */}
        <Route
          path="/"
          element={
            <RequireAdmin isAuthed={isAuthed}>
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
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />

          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/blockchain" replace />} />
            <Route path="regions" element={<SettingsRegions />} />
            <Route path="verification-providers" element={<SettingsVerificationProviders />} />
            <Route path="blockchain" element={<SettingsBlockchain />} />
            <Route path="security" element={<SettingsSecurity />} />
            <Route path="notifications" element={<SettingsNotifications />} />
          </Route>
        </Route>

        {/* fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
