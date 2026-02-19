import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Profiles from '../pages/Profiles';
import { profilesApi } from '../api/client';
import type { UserProfile, ProfilesResponse, ParticipationRecord } from '../types';

// Mock the API client
vi.mock('../api/client', () => ({
  profilesApi: {
    list: vi.fn(),
    getById: vi.fn(),
    exportAggregated: vi.fn(),
    exportProfileList: vi.fn(),
    getParticipation: vi.fn(),
  },
}));

// Mock window.open
global.open = vi.fn();

// Mock window.confirm
global.confirm = vi.fn(() => true);

// Mock window.alert
global.alert = vi.fn();

const mockProfiles: UserProfile[] = [
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
    status: 'active',
    notificationsEnabled: false,
    lastLoginAt: '2026-01-28T14:20:00Z',
    enrolledAt: '2026-01-10T12:00:00Z',
  },
  {
    id: 'profile-3',
    personalNumber: '11111111111',
    personalNumberMasked: '***111111',
    ageBucket: '18-24',
    genderBucket: 'Other',
    regionBucket: 'reg_kutaisi',
    status: 'pending',
    notificationsEnabled: true,
    enrolledAt: '2026-01-29T16:45:00Z',
  },
];

const mockProfilesResponse: ProfilesResponse = {
  profiles: mockProfiles,
  total: 3,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

describe('Profiles Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profilesApi.list).mockResolvedValue(mockProfilesResponse);
  });

  describe('Display and Loading', () => {
    it('shows loading state initially', () => {
      render(<Profiles />);
      expect(screen.getByText('Registered Profiles')).toBeInTheDocument();
      expect(screen.getByText(/Manage and monitor registered users/)).toBeInTheDocument();
    });

    it('displays profile list after loading', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
        expect(screen.getByText('***543210')).toBeInTheDocument();
        expect(screen.getByText('***111111')).toBeInTheDocument();
      });
    });

    it('displays correct results count', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('Showing 3 of 3 profiles')).toBeInTheDocument();
      });
    });
  });

  describe('Personal Number Masking', () => {
    it('always displays masked personal numbers by default', async () => {
      render(<Profiles />);

      await waitFor(() => {
        // Check that masked versions are shown
        expect(screen.getByText('***567890')).toBeInTheDocument();
        expect(screen.getByText('***543210')).toBeInTheDocument();
        expect(screen.getByText('***111111')).toBeInTheDocument();

        // Check that full numbers are NOT shown
        expect(screen.queryByText('01234567890')).not.toBeInTheDocument();
        expect(screen.queryByText('09876543210')).not.toBeInTheDocument();
        expect(screen.queryByText('11111111111')).not.toBeInTheDocument();
      });
    });

    it('enforces PN masking in API responses', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.any(Object),
            page: 1,
            pageSize: 20,
          })
        );
      });

      // Verify all displayed profiles have masked PNs
      const maskedPNs = screen.getAllByText(/\*{3}\d{6}/);
      expect(maskedPNs.length).toBe(3);
    });
  });

  describe('Profile Information Display', () => {
    it('displays name and surname when available', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('Giorgi Beridze')).toBeInTheDocument();
        expect(screen.getByText('Nino Lomidze')).toBeInTheDocument();
      });
    });

    it('displays dash when name/surname not available', async () => {
      render(<Profiles />);

      await waitFor(() => {
        const dashElements = screen.getAllByText('-');
        expect(dashElements.length).toBeGreaterThan(0);
      });
    });

    it('displays demographic buckets correctly', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('25-34')).toBeInTheDocument();
        expect(screen.getByText('35-44')).toBeInTheDocument();
        expect(screen.getByText('18-24')).toBeInTheDocument();
      });
    });

    it('displays status badges with correct styling', async () => {
      render(<Profiles />);

      await waitFor(() => {
        const activeStatuses = screen.getAllByText('active');
        expect(activeStatuses.length).toBe(2);

        const pendingStatus = screen.getByText('pending');
        expect(pendingStatus).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('allows searching by personal number', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by personal number/);
      const searchButton = screen.getByRole('button', { name: /Search/i });

      fireEvent.change(searchInput, { target: { value: '567890' } });
      fireEvent.click(searchButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              search: '567890',
            }),
          })
        );
      });
    });

    it('allows searching by name/surname', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('Giorgi Beridze')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by personal number/);
      const searchButton = screen.getByRole('button', { name: /Search/i });

      fireEvent.change(searchInput, { target: { value: 'Giorgi' } });
      fireEvent.click(searchButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              search: 'Giorgi',
            }),
          })
        );
      });
    });

    it('clears search when X button clicked', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by personal number/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const clearButton = screen.getByRole('button', { name: '' });
      fireEvent.click(clearButton);

      expect(searchInput).toHaveValue('');
    });
  });

  describe('Filter Functionality', () => {
    it('opens filter panel when Filters button clicked', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText('Age Bucket')).toBeInTheDocument();
        expect(screen.getByText('Gender')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
      });
    });

    it('applies age bucket filter', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const ageSelect = screen.getByLabelText('Age Bucket');
      fireEvent.change(ageSelect, { target: { value: '25-34' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              ageBucket: '25-34',
            }),
          })
        );
      });
    });

    it('applies gender filter', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const genderSelect = screen.getByLabelText('Gender');
      fireEvent.change(genderSelect, { target: { value: 'F' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              genderBucket: 'F',
            }),
          })
        );
      });
    });

    it('applies status filter', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.change(statusSelect, { target: { value: 'active' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              status: 'active',
            }),
          })
        );
      });
    });

    it('applies region filter', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const regionInput = screen.getByLabelText('Region');
      fireEvent.change(regionInput, { target: { value: 'reg_tbilisi' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              regionBucket: 'reg_tbilisi',
            }),
          })
        );
      });
    });

    it('applies notifications enabled filter', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const notifSelect = screen.getByLabelText('Notifications');
      fireEvent.change(notifSelect, { target: { value: 'true' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              notificationsEnabled: true,
            }),
          })
        );
      });
    });

    it('applies date range filters', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const startDateInput = screen.getByLabelText('Last Login From');
      const endDateInput = screen.getByLabelText('Last Login To');

      fireEvent.change(startDateInput, { target: { value: '2026-01-01' } });
      fireEvent.change(endDateInput, { target: { value: '2026-01-31' } });

      const applyButton = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              lastLoginStart: '2026-01-01',
              lastLoginEnd: '2026-01-31',
            }),
          })
        );
      });
    });

    it('clears all filters when Clear All clicked', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const filtersButton = screen.getByRole('button', { name: /Filters/i });
      fireEvent.click(filtersButton);

      const ageSelect = screen.getByLabelText('Age Bucket');
      fireEvent.change(ageSelect, { target: { value: '25-34' } });

      const clearAllButton = screen.getByRole('button', { name: /Clear All/i });
      fireEvent.click(clearAllButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              ageBucket: undefined,
            }),
          })
        );
      });
    });
  });

  describe('Export Functionality', () => {
    it('exports aggregated data successfully', async () => {
      vi.mocked(profilesApi.exportAggregated).mockResolvedValue({
        exportId: 'export-123',
        downloadUrl: 'https://example.com/export-123.csv',
      });

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /Export Aggregated/i });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(profilesApi.exportAggregated).toHaveBeenCalledWith(
          expect.objectContaining({
            search: '',
          })
        );
        expect(window.open).toHaveBeenCalledWith('https://example.com/export-123.csv', '_blank');
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('Export started. Export ID: export-123')
        );
      });
    });

    it('shows alert when aggregated export is rate-limited', async () => {
      vi.mocked(profilesApi.exportAggregated).mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /Export Aggregated/i });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          'Failed to export data. This action is rate-limited.'
        );
      });
    });

    it('requires confirmation for profile list export', async () => {
      vi.mocked(global.confirm).mockReturnValue(false);

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', {
        name: /Export Profile List \(Restricted\)/i,
      });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalledWith(
          expect.stringContaining('restricted operation')
        );
        expect(profilesApi.exportProfileList).not.toHaveBeenCalled();
      });
    });

    it('exports profile list after confirmation with audit logging notice', async () => {
      vi.mocked(global.confirm).mockReturnValue(true);
      vi.mocked(profilesApi.exportProfileList).mockResolvedValue({
        exportId: 'export-456',
        downloadUrl: 'https://example.com/export-456.csv',
      });

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', {
        name: /Export Profile List \(Restricted\)/i,
      });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(profilesApi.exportProfileList).toHaveBeenCalledWith(
          expect.objectContaining({
            search: '',
          })
        );
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('This action has been logged')
        );
      });
    });

    it('shows alert when profile list export is rate-limited or forbidden', async () => {
      vi.mocked(global.confirm).mockReturnValue(true);
      vi.mocked(profilesApi.exportProfileList).mockRejectedValue(new Error('Forbidden'));

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', {
        name: /Export Profile List \(Restricted\)/i,
      });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('rate-limited and requires special permissions')
        );
      });
    });
  });

  describe('Participation View', () => {
    const mockParticipation: ParticipationRecord[] = [
      {
        pollId: 'poll-1',
        pollTitle: 'Should Georgia join EU?',
        participated: true,
        participationDate: '2026-01-20',
      },
      {
        pollId: 'poll-2',
        pollTitle: 'Infrastructure funding priorities',
        participated: false,
      },
    ];

    it('opens participation modal when eye icon clicked', async () => {
      vi.mocked(profilesApi.getParticipation).mockResolvedValue(mockParticipation);

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const eyeButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(eyeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Participation Records/)).toBeInTheDocument();
        expect(profilesApi.getParticipation).toHaveBeenCalledWith('profile-1');
      });
    });

    it('displays participation as YES/NO only (no vote choice)', async () => {
      vi.mocked(profilesApi.getParticipation).mockResolvedValue(mockParticipation);

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const eyeButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(eyeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('YES')).toBeInTheDocument();
        expect(screen.getByText('NO')).toBeInTheDocument();

        // Verify vote choice is NEVER shown
        expect(screen.queryByText(/voted for/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
      });
    });

    it('shows privacy notice in participation modal', async () => {
      vi.mocked(profilesApi.getParticipation).mockResolvedValue(mockParticipation);

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const eyeButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(eyeButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByText(/Vote choices are never displayed to maintain voter privacy/)
        ).toBeInTheDocument();
      });
    });

    it('shows alert when participation view requires permission', async () => {
      vi.mocked(profilesApi.getParticipation).mockRejectedValue(new Error('Forbidden'));

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const eyeButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(eyeButtons[0]);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('requires profiles.audit permission')
        );
      });
    });

    it('displays participation date at day-level only', async () => {
      vi.mocked(profilesApi.getParticipation).mockResolvedValue(mockParticipation);

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      const eyeButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(eyeButtons[0]);

      await waitFor(() => {
        // Check that date is shown at day level (no time)
        const dateElement = screen.getByText('1/20/2026');
        expect(dateElement).toBeInTheDocument();

        // Verify NO time information is shown
        expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('shows pagination controls when multiple pages exist', async () => {
      vi.mocked(profilesApi.list).mockResolvedValue({
        ...mockProfilesResponse,
        total: 50,
        totalPages: 3,
      });

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
      });
    });

    it('navigates to next page', async () => {
      vi.mocked(profilesApi.list).mockResolvedValue({
        ...mockProfilesResponse,
        total: 50,
        totalPages: 3,
      });

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(profilesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
          })
        );
      });
    });

    it('does not show pagination for single page', async () => {
      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('***567890')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Previous/i })).not.toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no profiles match criteria', async () => {
      vi.mocked(profilesApi.list).mockResolvedValue({
        profiles: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      render(<Profiles />);

      await waitFor(() => {
        expect(screen.getByText('No profiles found matching your criteria')).toBeInTheDocument();
      });
    });
  });
});
