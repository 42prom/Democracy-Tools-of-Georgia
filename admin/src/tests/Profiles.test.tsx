import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Profiles from '../pages/Profiles';
import { profilesApi, regionsApi } from '../api/client';
import type { ProfilesResponse, UserProfile } from '../types';

vi.mock('../api/client', () => ({
  adminFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
    ...init,
    credentials: 'include',
  })),
  profilesApi: {
    list: vi.fn(),
    getParticipation: vi.fn(),
    updateRegion: vi.fn(),
    resetSecurity: vi.fn(),
    resetEnrollment: vi.fn(),
  },
  regionsApi: { list: vi.fn() },
}));

const profiles: UserProfile[] = [
  {
    id: 'profile-1',
    personalNumber: '01234567890',
    personalNumberMasked: '***567890',
    name: 'Giorgi',
    surname: 'Beridze',
    ageBucket: '25-34',
    genderBucket: 'M',
    regionBucket: 'reg_tbilisi',
    status: 'active',
    notificationsEnabled: true,
    lastLoginAt: '2026-01-25T10:30:00Z',
    enrolledAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'profile-2',
    personalNumber: '09876543210',
    personalNumberMasked: '***543210',
    name: 'Nino',
    surname: 'Lomidze',
    ageBucket: '35-44',
    genderBucket: 'F',
    regionBucket: 'reg_batumi',
    status: 'pending',
    notificationsEnabled: false,
    enrolledAt: '2026-01-10T12:00:00Z',
  },
];

const response: ProfilesResponse = {
  profiles,
  total: profiles.length,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

describe('Profiles privacy-sensitive admin flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('admin_csrf', 'test-csrf-proof');
    vi.mocked(profilesApi.list).mockResolvedValue(response);
    vi.mocked(regionsApi.list).mockResolvedValue([
      { id: '1', code: 'reg_tbilisi', name_en: 'Tbilisi', name_ka: 'თბილისი', active: true },
      { id: '2', code: 'reg_batumi', name_en: 'Batumi', name_ka: 'ბათუმი', active: true },
    ]);
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test-export'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  async function waitForProfiles() {
    await waitFor(() => expect(screen.getByText('***567890')).toBeInTheDocument());
  }

  it('renders masked personal numbers and never renders raw personal numbers', async () => {
    render(<Profiles />);
    await waitForProfiles();

    expect(screen.getByText('***543210')).toBeInTheDocument();
    expect(screen.queryByText('01234567890')).not.toBeInTheDocument();
    expect(screen.queryByText('09876543210')).not.toBeInTheDocument();
    expect(screen.getByText('Giorgi')).toBeInTheDocument();
    expect(screen.getByText('Beridze')).toBeInTheDocument();
  });

  it('passes search input as a server-side filter', async () => {
    render(<Profiles />);
    await waitForProfiles();

    fireEvent.change(screen.getByPlaceholderText(/Search by personal number/), {
      target: { value: 'Giorgi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(profilesApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ search: 'Giorgi' }) })
      );
    });
  });

  it('provides accessible demographic and date filters', async () => {
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

    fireEvent.change(screen.getByLabelText('Age Bucket'), { target: { value: '25-34' } });
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'reg_tbilisi' } });
    fireEvent.change(screen.getByLabelText('Last Login From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Last Login To'), { target: { value: '2026-01-31' } });

    await waitFor(() => {
      expect(profilesApi.list).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            ageBucket: '25-34',
            genderBucket: 'F',
            regionBucket: 'reg_tbilisi',
            lastLoginStart: '2026-01-01',
            lastLoginEnd: '2026-01-31',
          }),
        })
      );
    });
  });

  it('clears search and advanced filters together', async () => {
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.change(screen.getByPlaceholderText(/Search by personal number/), {
      target: { value: '567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Age Bucket'), { target: { value: '25-34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    expect(screen.getByPlaceholderText(/Search by personal number/)).toHaveValue('');
    expect(screen.getByLabelText('Age Bucket')).toHaveValue('');
    await waitFor(() => {
      expect(profilesApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ search: '', ageBucket: undefined }) })
      );
    });
  });

  it('downloads a successful authenticated export and revokes its object URL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(new Blob(['safe,csv'])),
    } as unknown as Response);
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.click(screen.getByRole('button', { name: 'Export Aggregated' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/admin/export/users-aggregated.csv',
        expect.objectContaining({
          credentials: 'include',
          headers: expect.not.objectContaining({ Authorization: expect.anything() }),
        })
      );
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-export');
    });
  });

  it('fails closed when the export endpoint rejects the request', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.click(screen.getByRole('button', { name: 'Export Aggregated' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Failed to export data.');
      expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    });
  });

  it('shows participation only as YES/NO with no vote choice', async () => {
    vi.mocked(profilesApi.getParticipation).mockResolvedValue({
      metadata: { notificationsEnabled: true, enrolledAt: '2026-01-15T08:00:00Z' },
      participationRecords: [
        {
          pollId: 'poll-1',
          pollTitle: 'Infrastructure priorities',
          participated: true,
          participationDate: '2026-01-20',
        },
      ],
    });
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.click(screen.getByRole('button', { name: 'View participation for ***567890' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Participation Details' })).toBeInTheDocument();
      expect(screen.getByText('Infrastructure priorities')).toBeInTheDocument();
      expect(screen.getByText('YES')).toBeInTheDocument();
    });
    expect(screen.getByText(/Vote choices are never displayed/i)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /choice/i })).not.toBeInTheDocument();
  });

  it('reports participation permission failures without exposing data', async () => {
    vi.mocked(profilesApi.getParticipation).mockRejectedValue(new Error('Forbidden'));
    render(<Profiles />);
    await waitForProfiles();
    fireEvent.click(screen.getByRole('button', { name: 'View participation for ***567890' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        'Failed to load participation records. This requires profiles.audit permission.'
      );
    });
    expect(screen.queryByText('Infrastructure priorities')).not.toBeInTheDocument();
  });
});
