import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminUsers from '../pages/AdminUsers';
import { adminUsersApi } from '../api/client';

vi.mock('../api/client', () => ({
  adminUsersApi: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), revokeSessions: vi.fn(),
    resetPassword: vi.fn(), resetMfa: vi.fn(),
  },
}));

const account = {
  id: 'admin-1', email: 'auditor@example.ge', role: 'observer' as const,
  fullName: 'Independent Auditor', isActive: true, failedLoginAttempts: 0,
  passwordChangedAt: '2026-09-03T00:00:00.000Z', createdAt: '2026-09-03T00:00:00.000Z',
  mfaEnabled: false,
};

describe('Admin account control plane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUsersApi.list).mockResolvedValue([account]);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('shows account status, MFA enrollment, and role controls', async () => {
    render(<AdminUsers />);
    expect(await screen.findByText('auditor@example.ge')).toBeInTheDocument();
    expect(screen.getByText('MFA pending')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for auditor@example.ge')).toHaveValue('observer');
  });

  it('reveals provisioning material only after explicit account creation', async () => {
    vi.mocked(adminUsersApi.create).mockResolvedValue({
      ...account,
      mfaSecret: 'ABCDEFGHIJKLMNOP234567ABCDEFGHIJ',
      mfaProvisioningUri: 'otpauth://totp/test?secret=ABCDEFGHIJKLMNOP234567ABCDEFGHIJ',
    });
    render(<AdminUsers />);
    await screen.findByText('auditor@example.ge');
    fireEvent.click(screen.getByRole('button', { name: 'Add admin' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.ge' } });
    fireEvent.change(screen.getByLabelText('Initial password'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(adminUsersApi.create).toHaveBeenCalled());
    expect(await screen.findByText('One-time MFA provisioning')).toBeInTheDocument();
    expect(screen.getByText('ABCDEFGHIJKLMNOP234567ABCDEFGHIJ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I stored it securely' }));
    expect(screen.queryByText('ABCDEFGHIJKLMNOP234567ABCDEFGHIJ')).not.toBeInTheDocument();
  });
});
