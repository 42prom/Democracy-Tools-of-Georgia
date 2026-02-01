import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import SettingsLayout from './components/SettingsLayout';
import CreatePoll from './pages/CreatePoll';
import DraftedPolls from './pages/DraftedPolls';
import ActivePolls from './pages/ActivePolls';
import VotingHistory from './pages/VotingHistory';
import SettingsRegions from './pages/SettingsRegions';
import SettingsVerificationProviders from './pages/SettingsVerificationProviders';
import Dashboard from './pages/Dashboard';
import SecurityLogs from './pages/SecurityLogs';
import PollDetails from './pages/PollDetails';
import Insights from './pages/Insights';
import Profiles from './pages/Profiles';
import MessagesList from './pages/MessagesList';
import MessageEditor from './pages/MessageEditor';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
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
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/regions" replace />} />
            <Route path="regions" element={<SettingsRegions />} />
            <Route path="verification-providers" element={<SettingsVerificationProviders />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
