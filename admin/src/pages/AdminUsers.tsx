import { FormEvent, useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, ShieldCheck, UserRoundCog } from 'lucide-react';
import { adminUsersApi } from '../api/client';
import type { AdminAccount, AdminMfaProvisioning, AdminUser } from '../types';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';

const ROLES: AdminUser['role'][] = ['observer', 'moderator', 'admin', 'superadmin'];

function errorMessage(error: unknown): string {
  const candidate = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return candidate.response?.data?.error?.message || candidate.message || 'Operation failed';
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [provisioning, setProvisioning] = useState<(AdminMfaProvisioning & { email: string }) | null>(null);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'observer' as AdminUser['role'], password: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await adminUsersApi.list());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const created = await adminUsersApi.create(form);
      setProvisioning({
        email: created.email,
        mfaSecret: created.mfaSecret,
        mfaProvisioningUri: created.mfaProvisioningUri,
      });
      setForm({ email: '', fullName: '', role: 'observer', password: '' });
      setCreating(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function updateUser(id: string, data: { role?: AdminUser['role']; isActive?: boolean }) {
    setError('');
    try {
      await adminUsersApi.update(id, data);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function revokeSessions(user: AdminAccount) {
    if (!window.confirm(`Revoke every active session for ${user.email}?`)) return;
    try {
      await adminUsersApi.revokeSessions(user.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    try {
      await adminUsersApi.resetPassword(resetTarget.id, resetPassword);
      setResetPassword('');
      setResetTarget(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function resetMfa(user: AdminAccount) {
    if (!window.confirm(`Replace MFA for ${user.email} and revoke every active session?`)) return;
    try {
      const result = await adminUsersApi.resetMfa(user.id);
      setProvisioning({ email: user.email, ...result });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Accounts</h1>
          <p className="text-sm text-gray-600 mt-1">Roles, lockouts, credentials, and session revocation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
          <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add admin</Button>
        </div>
      </div>

      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700">{error}</div>}

      <Card>
        {loading ? <p className="p-6 text-gray-500">Loading accounts…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr><th className="p-3">Account</th><th className="p-3">Role</th><th className="p-3">State</th><th className="p-3">Last login</th><th className="p-3">Controls</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="p-3"><div className="font-medium">{user.fullName || 'Unnamed admin'}</div><div className="text-gray-500">{user.email}</div></td>
                    <td className="p-3">
                      <select aria-label={`Role for ${user.email}`} value={user.role} onChange={e => void updateUser(user.id, { role: e.target.value as AdminUser['role'] })} className="border rounded px-2 py-1">
                        {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <span className={user.isActive ? 'text-green-700' : 'text-red-700'}>{user.isActive ? 'Active' : 'Disabled'}</span>
                      <div className={user.mfaEnabled ? 'text-green-700' : 'text-amber-700'}>MFA {user.mfaEnabled ? 'enrolled' : 'pending'}</div>
                      {user.lockedUntil && <div className="text-amber-700">Locked until {new Date(user.lockedUntil).toLocaleString()}</div>}
                    </td>
                    <td className="p-3 text-gray-600">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void revokeSessions(user)}>Revoke sessions</Button>
                      <Button size="sm" variant="secondary" onClick={() => setResetTarget(user)}><KeyRound className="w-3 h-3 mr-1" />Reset password</Button>
                      <Button size="sm" variant="secondary" onClick={() => void resetMfa(user)}>Replace MFA</Button>
                      <Button size="sm" variant={user.isActive ? 'danger' : 'primary'} onClick={() => void updateUser(user.id, { isActive: !user.isActive })}>{user.isActive ? 'Disable' : 'Enable'}</Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Create admin account" icon={<UserRoundCog className="w-5 h-5" />}>
        <form onSubmit={createUser} className="space-y-4">
          <Input label="Email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input label="Full name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
          <label className="block text-sm font-medium text-gray-700">Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as AdminUser['role'] })} className="mt-1 w-full border rounded-lg px-3 py-2">{ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
          <Input label="Initial password" type="password" minLength={14} maxLength={72} required autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <p className="text-xs text-gray-500">At least 14 characters. Transfer it through an approved secret channel.</p>
          <Button type="submit"><ShieldCheck className="w-4 h-4 mr-2" />Create account</Button>
        </form>
      </Modal>

      <Modal isOpen={!!resetTarget} onClose={() => { setResetTarget(null); setResetPassword(''); }} title="Reset admin password" icon={<KeyRound className="w-5 h-5" />}>
        <form onSubmit={submitPasswordReset} className="space-y-4">
          <p className="text-sm text-gray-600">All sessions for {resetTarget?.email} will be revoked.</p>
          <Input label="New password" type="password" minLength={14} maxLength={72} required autoComplete="new-password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
          <Button type="submit" variant="danger">Reset and revoke</Button>
        </form>
      </Modal>

      <Modal isOpen={!!provisioning} onClose={() => setProvisioning(null)} title="One-time MFA provisioning" icon={<ShieldCheck className="w-5 h-5" />}>
        <div className="space-y-4">
          <p className="text-sm text-red-700">This secret is shown once. Transfer it securely to {provisioning?.email}; do not paste it into tickets or logs.</p>
          <div><div className="text-xs font-medium text-gray-600">Authenticator secret</div><code className="block mt-1 p-3 bg-gray-100 rounded break-all select-all">{provisioning?.mfaSecret}</code></div>
          <div><div className="text-xs font-medium text-gray-600">Provisioning URI</div><code className="block mt-1 p-3 bg-gray-100 rounded break-all select-all text-xs">{provisioning?.mfaProvisioningUri}</code></div>
          <Button onClick={() => setProvisioning(null)}>I stored it securely</Button>
        </div>
      </Modal>
    </div>
  );
}
