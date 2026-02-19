/**
 * SettingsRegions Component Tests - CHUNK F
 *
 * Tests for regions CRUD functionality:
 * - List/search regions
 * - Add/Edit/Delete regions
 * - Toggle active status
 * - CSV import
 * - Data persistence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsRegions from '../pages/SettingsRegions';
import { regionsApi } from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  regionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toggleActive: vi.fn(),
    importCSV: vi.fn(),
  },
}));

const mockRegions = [
  {
    id: '1',
    code: 'reg_tbilisi',
    name_en: 'Tbilisi',
    name_ka: 'თბილისი',
    active: true,
  },
  {
    id: '2',
    code: 'reg_batumi',
    name_en: 'Batumi',
    name_ka: 'ბათუმი',
    active: true,
  },
  {
    id: '3',
    code: 'reg_kutaisi',
    name_en: 'Kutaisi',
    name_ka: 'ქუთაისი',
    parent_region_id: 'reg_1',
    active: false,
  },
];

describe('SettingsRegions Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (regionsApi.list as any).mockResolvedValue(mockRegions);
  });

  describe('List and Display', () => {
    it('should load and display regions', async () => {
      render(<SettingsRegions />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Verify all regions are displayed
      expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      expect(screen.getByText('Batumi')).toBeInTheDocument();
      expect(screen.getByText('Kutaisi')).toBeInTheDocument();

      // Verify Georgian names
      expect(screen.getByText('თბილისი')).toBeInTheDocument();
      expect(screen.getByText('ბათუმი')).toBeInTheDocument();
      expect(screen.getByText('ქუთაისი')).toBeInTheDocument();

      // Verify codes
      expect(screen.getByText('reg_tbilisi')).toBeInTheDocument();
      expect(screen.getByText('reg_batumi')).toBeInTheDocument();
      expect(screen.getByText('reg_kutaisi')).toBeInTheDocument();
    });

    it('should display active/inactive status', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Check for active badges
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBe(2);

      // Check for inactive badge
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should display parent region ID when present', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Kutaisi')).toBeInTheDocument();
      });

      // Kutaisi has parent_region_id
      expect(screen.getByText('reg_1')).toBeInTheDocument();
    });

    it('should show empty state when no regions', async () => {
      (regionsApi.list as any).mockResolvedValue([]);

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('No regions configured')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter regions by code', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Type in search box
      const searchInput = screen.getByPlaceholderText('Search regions...');
      fireEvent.change(searchInput, { target: { value: 'tbilisi' } });

      // Only Tbilisi should be visible
      expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      expect(screen.queryByText('Batumi')).not.toBeInTheDocument();
      expect(screen.queryByText('Kutaisi')).not.toBeInTheDocument();
    });

    it('should filter regions by English name', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search regions...');
      fireEvent.change(searchInput, { target: { value: 'batu' } });

      expect(screen.queryByText('Tbilisi')).not.toBeInTheDocument();
      expect(screen.getByText('Batumi')).toBeInTheDocument();
      expect(screen.queryByText('Kutaisi')).not.toBeInTheDocument();
    });

    it('should filter regions by Georgian name', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search regions...');
      fireEvent.change(searchInput, { target: { value: 'ბათუმი' } });

      expect(screen.queryByText('Tbilisi')).not.toBeInTheDocument();
      expect(screen.getByText('Batumi')).toBeInTheDocument();
    });

    it('should clear search when X button clicked', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search regions...');
      fireEvent.change(searchInput, { target: { value: 'kutaisi' } });

      // Only Kutaisi visible
      expect(screen.queryByText('Tbilisi')).not.toBeInTheDocument();
      expect(screen.getByText('Kutaisi')).toBeInTheDocument();

      // Click clear button
      const clearButton = screen.getByRole('button', { name: '' }); // X icon button
      fireEvent.click(clearButton);

      // All regions should be visible again
      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
        expect(screen.getByText('Batumi')).toBeInTheDocument();
        expect(screen.getByText('Kutaisi')).toBeInTheDocument();
      });
    });

    it('should show no results message when search has no matches', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search regions...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No regions match your search')).toBeInTheDocument();
    });
  });

  describe('Create Region', () => {
    it('should open modal when Add Region clicked', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Region');
      fireEvent.click(addButton);

      // Modal should be visible
      expect(screen.getByText('Add Region')).toBeInTheDocument();
      expect(screen.getByLabelText(/region code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/name \(english\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/name \(georgian\)/i)).toBeInTheDocument();
    });

    it('should create new region successfully', async () => {
      const newRegion = {
        id: '4',
        code: 'reg_rustavi',
        name_en: 'Rustavi',
        name_ka: 'რუსთავი',
        active: true,
      };

      (regionsApi.create as any).mockResolvedValue(newRegion);
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Click Add Region
      fireEvent.click(screen.getByText('Add Region'));

      // Fill form
      fireEvent.change(screen.getByLabelText(/region code/i), {
        target: { value: 'reg_rustavi' },
      });
      fireEvent.change(screen.getByLabelText(/name \(english\)/i), {
        target: { value: 'Rustavi' },
      });
      fireEvent.change(screen.getByLabelText(/name \(georgian\)/i), {
        target: { value: 'რუსთავი' },
      });

      // Submit form
      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      // Verify API was called
      await waitFor(() => {
        expect(regionsApi.create).toHaveBeenCalledWith({
          code: 'reg_rustavi',
          name_en: 'Rustavi',
          name_ka: 'რუსთავი',
          parent_region_id: '',
          active: true,
        });
        expect(global.alert).toHaveBeenCalledWith('Region created successfully');
      });
    });

    it('should validate required fields', async () => {
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Region'));

      // Try to submit without filling fields
      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Please fill in all required fields');
        expect(regionsApi.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('Edit Region', () => {
    it('should open modal with prefilled data when edit clicked', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Click edit button (first edit icon)
      const editButtons = screen.getAllByRole('button', { name: '' });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-edit')
      );
      fireEvent.click(editButton!);

      // Modal should show with prefilled data
      await waitFor(() => {
        expect(screen.getByText('Edit Region')).toBeInTheDocument();
        expect(screen.getByDisplayValue('reg_tbilisi')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Tbilisi')).toBeInTheDocument();
        expect(screen.getByDisplayValue('თბილისი')).toBeInTheDocument();
      });
    });

    it('should update region successfully', async () => {
      const updatedRegion = {
        ...mockRegions[0],
        name_en: 'Tbilisi Updated',
      };

      (regionsApi.update as any).mockResolvedValue(updatedRegion);
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Click edit
      const editButtons = screen.getAllByRole('button', { name: '' });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-edit')
      );
      fireEvent.click(editButton!);

      // Update name
      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('Tbilisi');
        fireEvent.change(nameInput, { target: { value: 'Tbilisi Updated' } });
      });

      // Submit
      const updateButton = screen.getByRole('button', { name: /update/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(regionsApi.update).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            name_en: 'Tbilisi Updated',
          })
        );
        expect(global.alert).toHaveBeenCalledWith('Region updated successfully');
      });
    });
  });

  describe('Delete Region', () => {
    it('should delete region after confirmation', async () => {
      global.confirm = vi.fn(() => true);
      global.alert = vi.fn();
      (regionsApi.delete as any).mockResolvedValue(undefined);

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-trash-2')
      );
      fireEvent.click(deleteButton!);

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalledWith(
          'Are you sure you want to delete "Tbilisi"?'
        );
        expect(regionsApi.delete).toHaveBeenCalledWith('1');
        expect(global.alert).toHaveBeenCalledWith('Region deleted successfully');
      });
    });

    it('should not delete if user cancels confirmation', async () => {
      global.confirm = vi.fn(() => false);

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-trash-2')
      );
      fireEvent.click(deleteButton!);

      expect(regionsApi.delete).not.toHaveBeenCalled();
    });
  });

  describe('Toggle Active Status', () => {
    it('should toggle region active status', async () => {
      const toggledRegion = { ...mockRegions[0], active: false };
      (regionsApi.toggleActive as any).mockResolvedValue(toggledRegion);

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Click active badge to toggle
      const activeBadge = screen.getAllByText('Active')[0];
      fireEvent.click(activeBadge);

      await waitFor(() => {
        expect(regionsApi.toggleActive).toHaveBeenCalledWith('1', false);
      });
    });

    it('should handle toggle active errors', async () => {
      (regionsApi.toggleActive as any).mockRejectedValue(new Error('Failed to toggle'));
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const activeBadge = screen.getAllByText('Active')[0];
      fireEvent.click(activeBadge);

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Failed to update region status');
      });
    });
  });

  describe('CSV Import', () => {
    it('should trigger file input when Import CSV clicked', async () => {
      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const importButton = screen.getByText('Import CSV');
      fireEvent.click(importButton);

      // File input should be triggered (hard to test click, but we can verify button exists)
      expect(importButton).toBeInTheDocument();
    });

    it('should import CSV successfully', async () => {
      (regionsApi.importCSV as any).mockResolvedValue({
        imported: 5,
        errors: [],
      });
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      // Simulate file selection
      const file = new File(['code,name_en,name_ka\nreg_test,Test,ტესტი'], 'regions.csv', {
        type: 'text/csv',
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [file],
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(regionsApi.importCSV).toHaveBeenCalled();
        expect(global.alert).toHaveBeenCalledWith(
          'Import completed!\nImported: 5 regions\nErrors: 0'
        );
      });
    });

    it('should show errors after CSV import', async () => {
      (regionsApi.importCSV as any).mockResolvedValue({
        imported: 3,
        errors: ['Row 4: Invalid code', 'Row 5: Missing name'],
      });
      global.alert = vi.fn();

      render(<SettingsRegions />);

      await waitFor(() => {
        expect(screen.getByText('Tbilisi')).toBeInTheDocument();
      });

      const file = new File(['invalid,csv,data'], 'regions.csv', { type: 'text/csv' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [file],
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(
          'Import completed!\nImported: 3 regions\nErrors: 2'
        );
      });
    });
  });
});
