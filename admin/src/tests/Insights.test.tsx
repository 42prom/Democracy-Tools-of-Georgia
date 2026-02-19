import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Insights from '../pages/Insights';
import { insightsApi } from '../api/client';
import type { InsightsResponse } from '../types';

// Mock the API client
vi.mock('../api/client', () => ({
  insightsApi: {
    getDistributions: vi.fn(),
  },
}));

// Mock window.alert
global.alert = vi.fn();

const mockInsightsWithSuppression: InsightsResponse = {
  totalUsers: 1250,
  dimensions: [
    {
      dimension: 'ageBucket',
      cohorts: [
        { value: '18-24', count: 180, percentage: 14.4 },
        { value: '25-34', count: 450, percentage: 36.0 },
        { value: '35-44', count: 320, percentage: 25.6 },
        { value: '45-54', count: 200, percentage: 16.0 },
        { value: '55-64', count: 75, percentage: 6.0 },
        { value: '65+', count: '<k' }, // Suppressed cell
      ],
    },
    {
      dimension: 'genderBucket',
      cohorts: [
        { value: 'M', count: 680, percentage: 54.4 },
        { value: 'F', count: 545, percentage: 43.6 },
        { value: 'Other', count: '<k' }, // Suppressed cell
      ],
    },
    {
      dimension: 'regionBucket',
      cohorts: [
        { value: 'reg_tbilisi', count: 890, percentage: 71.2 },
        { value: 'reg_batumi', count: 210, percentage: 16.8 },
        { value: 'reg_kutaisi', count: 95, percentage: 7.6 },
        { value: 'reg_rustavi', count: '<k' }, // Suppressed cell
        { value: 'reg_gori', count: '<k' }, // Suppressed cell
        { value: 'reg_zugdidi', count: '<k' }, // Suppressed cell
      ],
    },
  ],
  metadata: {
    kThreshold: 30,
    suppressedCells: 5,
    queryTimestamp: '2026-01-30T10:30:00Z',
  },
};

const mockInsightsNoSuppression: InsightsResponse = {
  totalUsers: 500,
  dimensions: [
    {
      dimension: 'ageBucket',
      cohorts: [
        { value: '18-24', count: 100, percentage: 20.0 },
        { value: '25-34', count: 200, percentage: 40.0 },
        { value: '35-44', count: 150, percentage: 30.0 },
        { value: '45-54', count: 50, percentage: 10.0 },
      ],
    },
  ],
  metadata: {
    kThreshold: 30,
    suppressedCells: 0,
    queryTimestamp: '2026-01-30T11:00:00Z',
  },
};

const mockInsightsTotalSuppressed: InsightsResponse = {
  totalUsers: '<k', // Total users suppressed due to k-anon
  dimensions: [],
  metadata: {
    kThreshold: 30,
    suppressedCells: 0,
    queryTimestamp: '2026-01-30T11:30:00Z',
  },
};

describe('Insights Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insightsApi.getDistributions).mockResolvedValue(mockInsightsWithSuppression);
  });

  describe('Display and Loading', () => {
    it('shows loading state initially', () => {
      render(<Insights />);
      expect(screen.getByText('User Insights')).toBeInTheDocument();
      expect(screen.getByText(/Aggregated distributions with k-anonymity enforcement/)).toBeInTheDocument();
    });

    it('displays insights after loading', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText(/Distribution by age Bucket/)).toBeInTheDocument();
        expect(screen.getByText(/Distribution by gender Bucket/)).toBeInTheDocument();
        expect(screen.getByText(/Distribution by region Bucket/)).toBeInTheDocument();
      });
    });

    it('displays privacy protection notice', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('Privacy Protection Enabled')).toBeInTheDocument();
        expect(screen.getByText(/k-anonymity enforcement/)).toBeInTheDocument();
      });
    });
  });

  describe('K-Anonymity Enforcement', () => {
    it('never shows cells with count < k threshold', async () => {
      render(<Insights />);

      await waitFor(() => {
        // Check that suppressed cohorts show "<k" instead of actual count
        const suppressedElements = screen.getAllByText('<k');
        expect(suppressedElements.length).toBeGreaterThan(0);

        // Verify actual small counts are NOT displayed
        // In our mock, 65+ age bucket and Other gender are suppressed
        const allText = screen.getByText(/65\+/).parentElement?.textContent || '';
        expect(allText).toContain('<k');
        expect(allText).not.toMatch(/\b\d+\b/); // No numeric count
      });
    });

    it('displays correct k-threshold value', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('30')).toBeInTheDocument();
      });
    });

    it('displays suppressed cells count in metadata', async () => {
      render(<Insights />);

      await waitFor(() => {
        const suppressedCellsElement = screen.getByText('5');
        expect(suppressedCellsElement).toBeInTheDocument();
      });
    });

    it('shows visual indicator for suppressed cohorts', async () => {
      render(<Insights />);

      await waitFor(() => {
        const suppressedLabels = screen.getAllByText(/Suppressed \(k-anonymity\)/);
        expect(suppressedLabels.length).toBe(5); // 5 suppressed cells in mock data
      });
    });

    it('handles total users suppression when below k', async () => {
      vi.mocked(insightsApi.getDistributions).mockResolvedValue(mockInsightsTotalSuppressed);

      render(<Insights />);

      await waitFor(() => {
        // Total users should show "<k" with shield icon
        const totalElement = screen.getByText('<k');
        expect(totalElement).toBeInTheDocument();
      });
    });

    it('shows proper counts for cohorts >= k threshold', async () => {
      vi.mocked(insightsApi.getDistributions).mockResolvedValue(mockInsightsNoSuppression);

      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('200')).toBeInTheDocument();
        expect(screen.getByText('150')).toBeInTheDocument();
        expect(screen.getByText('50')).toBeInTheDocument();

        // No suppressed cells
        expect(screen.queryByText('<k')).not.toBeInTheDocument();
      });
    });

    it('displays percentage only for non-suppressed cohorts', async () => {
      render(<Insights />);

      await waitFor(() => {
        // Check that suppressed cells don't have percentages
        const suppressedElements = screen.getAllByText('<k');
        suppressedElements.forEach((element) => {
          const parentText = element.parentElement?.textContent || '';
          expect(parentText).not.toMatch(/\d+\.\d+%/);
        });

        // Check that non-suppressed cells DO have percentages
        expect(screen.getByText(/36\.0%/)).toBeInTheDocument();
        expect(screen.getByText(/25\.6%/)).toBeInTheDocument();
      });
    });
  });

  describe('Inference Attack Defenses', () => {
    it('displays query budget limit', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText(/Query budget: 1\/20/)).toBeInTheDocument();
      });
    });

    it('enforces minimum time window of 24 hours', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText(/Minimum time window: 24 hours/)).toBeInTheDocument();
      });
    });

    it('blocks query when time window too small', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const minDateInput = screen.getByLabelText('Enrollment Date From');
      const maxDateInput = screen.getByLabelText('Enrollment Date To');

      // Set dates less than 24 hours apart
      fireEvent.change(minDateInput, { target: { value: '2026-01-30' } });
      fireEvent.change(maxDateInput, { target: { value: '2026-01-30' } });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('Time window must be at least 24 hours')
        );
        // API should NOT be called
        expect(insightsApi.getDistributions).toHaveBeenCalledTimes(1); // Only initial load
      });
    });

    it('allows query when time window is valid (>= 24 hours)', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const minDateInput = screen.getByLabelText('Enrollment Date From');
      const maxDateInput = screen.getByLabelText('Enrollment Date To');

      // Set dates more than 24 hours apart
      fireEvent.change(minDateInput, { target: { value: '2026-01-28' } });
      fireEvent.change(maxDateInput, { target: { value: '2026-01-30' } });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(insightsApi.getDistributions).toHaveBeenCalledWith(
          expect.objectContaining({
            minDate: '2026-01-28',
            maxDate: '2026-01-30',
          })
        );
      });
    });

    it('increments query count on each query', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText(/Query budget: 1\/20/)).toBeInTheDocument();
      });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(screen.getByText(/Query budget: 2\/20/)).toBeInTheDocument();
      });
    });

    it('blocks queries after budget exceeded', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });

      // Execute 20 queries to exhaust budget
      for (let i = 0; i < 20; i++) {
        fireEvent.click(queryButton);
        await waitFor(() => {
          expect(insightsApi.getDistributions).toHaveBeenCalledTimes(i + 2); // +1 for initial load
        });
      }

      await waitFor(() => {
        expect(screen.getByText('Query budget exceeded')).toBeInTheDocument();
        expect(queryButton).toBeDisabled();
      });

      // Try to query again - should be blocked
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('Query budget exceeded')
        );
      });
    });

    it('displays inference defense notice when suppressions occur', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('Inference Attack Defenses Active')).toBeInTheDocument();
        expect(
          screen.getByText(/Overlap queries are blocked, and a minimum 24-hour time window/)
        ).toBeInTheDocument();
      });
    });

    it('does not show inference notice when no suppressions', async () => {
      vi.mocked(insightsApi.getDistributions).mockResolvedValue(mockInsightsNoSuppression);

      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      expect(screen.queryByText('Inference Attack Defenses Active')).not.toBeInTheDocument();
    });
  });

  describe('Dimension Selection', () => {
    it('allows selecting dimensions to query', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const ageCheckbox = screen.getByLabelText(/age Bucket/i);
      const genderCheckbox = screen.getByLabelText(/gender Bucket/i);
      const regionCheckbox = screen.getByLabelText(/region Bucket/i);

      // All should be checked by default
      expect(ageCheckbox).toBeChecked();
      expect(genderCheckbox).toBeChecked();
      expect(regionCheckbox).toBeChecked();
    });

    it('queries with selected dimensions only', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const genderCheckbox = screen.getByLabelText(/gender Bucket/i);
      const regionCheckbox = screen.getByLabelText(/region Bucket/i);

      // Uncheck gender and region
      fireEvent.click(genderCheckbox);
      fireEvent.click(regionCheckbox);

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(insightsApi.getDistributions).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: ['ageBucket'], // Only age should be queried
          })
        );
      });
    });

    it('queries without dimensions parameter when none selected', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const ageCheckbox = screen.getByLabelText(/age Bucket/i);
      const genderCheckbox = screen.getByLabelText(/gender Bucket/i);
      const regionCheckbox = screen.getByLabelText(/region Bucket/i);

      // Uncheck all
      fireEvent.click(ageCheckbox);
      fireEvent.click(genderCheckbox);
      fireEvent.click(regionCheckbox);

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(insightsApi.getDistributions).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: undefined,
          })
        );
      });
    });
  });

  describe('Visualization and Display', () => {
    it('renders bar charts for each dimension', async () => {
      render(<Insights />);

      await waitFor(() => {
        // Check that all three dimension charts are rendered
        expect(screen.getByText(/Distribution by age Bucket/)).toBeInTheDocument();
        expect(screen.getByText(/Distribution by gender Bucket/)).toBeInTheDocument();
        expect(screen.getByText(/Distribution by region Bucket/)).toBeInTheDocument();
      });
    });

    it('displays cohort values and counts', async () => {
      render(<Insights />);

      await waitFor(() => {
        // Age buckets
        expect(screen.getByText('18-24')).toBeInTheDocument();
        expect(screen.getByText('25-34')).toBeInTheDocument();

        // Counts for non-suppressed
        expect(screen.getByText('180')).toBeInTheDocument();
        expect(screen.getByText('450')).toBeInTheDocument();
      });
    });

    it('uses shield icon for suppressed values', async () => {
      render(<Insights />);

      await waitFor(() => {
        const suppressedElements = screen.getAllByText('<k');
        expect(suppressedElements.length).toBeGreaterThan(0);
      });
    });

    it('displays metadata correctly', async () => {
      render(<Insights />);

      await waitFor(() => {
        // Total users
        expect(screen.getByText('1,250')).toBeInTheDocument();

        // K-threshold
        expect(screen.getByText('30')).toBeInTheDocument();

        // Suppressed cells
        expect(screen.getByText('5')).toBeInTheDocument();

        // Timestamp
        expect(screen.getByText(/1\/30\/2026/)).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('shows empty state before first query', async () => {
      vi.mocked(insightsApi.getDistributions).mockResolvedValue({
        totalUsers: 0,
        dimensions: [],
        metadata: {
          kThreshold: 30,
          suppressedCells: 0,
          queryTimestamp: '2026-01-30T10:00:00Z',
        },
      });

      render(<Insights />);

      await waitFor(() => {
        expect(
          screen.getByText(/Select dimensions and click "Query Insights"/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      vi.mocked(insightsApi.getDistributions).mockRejectedValue(
        new Error('Privacy constraint violation')
      );

      render(<Insights />);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          'Failed to load insights. This may be due to privacy constraints.'
        );
      });
    });
  });

  describe('Query Tracking', () => {
    it('displays last query timestamp', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText('User Insights')).toBeInTheDocument();
      });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(screen.getByText(/Last query:/)).toBeInTheDocument();
      });
    });

    it('shows queries remaining', async () => {
      render(<Insights />);

      await waitFor(() => {
        expect(screen.getByText(/Queries remaining: 19/)).toBeInTheDocument();
      });

      const queryButton = screen.getByRole('button', { name: /Query Insights/i });
      fireEvent.click(queryButton);

      await waitFor(() => {
        expect(screen.getByText(/Queries remaining: 18/)).toBeInTheDocument();
      });
    });
  });
});
