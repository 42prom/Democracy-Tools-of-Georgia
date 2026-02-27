/**
 * CreatePoll Component Tests - CHUNK E
 *
 * Tests for poll creation with reward functionality:
 * - Draft save/reload with rewards
 * - Publish validation (options >= 2, dates valid, k-anon >= 30)
 * - Reward fields persist
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreatePoll from '../pages/CreatePoll';
import { adminPollsApi, regionsApi } from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  adminPollsApi: {
    create: vi.fn(),
    estimate: vi.fn(),
    publish: vi.fn(),
    list: vi.fn(),
  },
  regionsApi: {
    list: vi.fn(),
  },
}));

describe('CreatePoll Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock regions list
    (regionsApi.list as any).mockResolvedValue([
      { id: '1', code: 'reg_tbilisi', name_en: 'Tbilisi', name_ka: 'თბილისი' },
      { id: '2', code: 'reg_batumi', name_en: 'Batumi', name_ka: 'ბათუმი' },
    ]);

    // Mock estimate to return safe by default
    (adminPollsApi.estimate as any).mockResolvedValue({
      count: 150,
      isPrivacySafe: true,
    });
  });

  describe('Draft Save/Reload', () => {
    it('should save draft with basic poll data', async () => {
      render(<CreatePoll />);

      // Fill in basic poll information
      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Test Poll' } });

      const descInput = screen.getByLabelText(/description/i);
      fireEvent.change(descInput, { target: { value: 'Test description' } });

      // Add option text
      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Yes' } });
      fireEvent.change(optionInputs[1], { target: { value: 'No' } });

      // Mock successful save
      (adminPollsApi.create as any).mockResolvedValue({
        id: 'poll-123',
        status: 'draft',
      });

      // Click save draft
      const saveDraftBtn = screen.getByText(/save draft/i);
      fireEvent.click(saveDraftBtn);

      // Verify API was called with correct data
      await waitFor(() => {
        expect(adminPollsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Poll',
            description: 'Test description',
            type: 'survey',
            options: ['Yes', 'No'],
          })
        );
      });
    });

    it('should save draft with reward configuration', async () => {
      render(<CreatePoll />);

      // Fill in basic info
      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Rewarded Poll' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Option A' } });
      fireEvent.change(optionInputs[1], { target: { value: 'Option B' } });

      // Enable rewards
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      fireEvent.click(rewardCheckbox);

      // Set reward amount
      await waitFor(() => {
        const rewardAmountInput = screen.getByLabelText(/reward amount/i);
        fireEvent.change(rewardAmountInput, { target: { value: '10.50' } });
      });

      // Mock successful save
      (adminPollsApi.create as any).mockResolvedValue({
        id: 'poll-456',
        status: 'draft',
      });

      // Save draft
      const saveDraftBtn = screen.getByText(/save draft/i);
      fireEvent.click(saveDraftBtn);

      // Verify rewards were included
      await waitFor(() => {
        expect(adminPollsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            rewards_enabled: true,
            reward_amount: 10.50,
            reward_token: 'DTG',
          })
        );
      });
    });

    it('should not include reward fields when rewards disabled', async () => {
      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'No Reward Poll' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Yes' } });
      fireEvent.change(optionInputs[1], { target: { value: 'No' } });

      // Rewards checkbox should be unchecked by default
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      expect(rewardCheckbox).not.toBeChecked();

      (adminPollsApi.create as any).mockResolvedValue({ id: 'poll-789' });

      const saveDraftBtn = screen.getByText(/save draft/i);
      fireEvent.click(saveDraftBtn);

      await waitFor(() => {
        expect(adminPollsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            rewards_enabled: false,
          })
        );
      });
    });
  });

  describe('Publish Validation', () => {
    it('should disable publish when title is empty', async () => {
      render(<CreatePoll />);

      const publishBtn = screen.getByText(/publish/i);

      // Should be disabled initially (no title)
      expect(publishBtn).toBeDisabled();
    });

    it('should disable publish when less than 2 options', async () => {
      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Test Poll' } });

      // Only fill one option
      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Only One' } });

      const publishBtn = screen.getByText(/publish/i);

      await waitFor(() => {
        expect(publishBtn).toBeDisabled();
      });
    });

    it('should disable publish when audience estimate is unsafe', async () => {
      // Mock unsafe estimate
      (adminPollsApi.estimate as any).mockResolvedValue({
        count: 15,
        isPrivacySafe: false,
      });

      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Unsafe Poll' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Yes' } });
      fireEvent.change(optionInputs[1], { target: { value: 'No' } });

      // Wait for estimate to complete
      await waitFor(() => {
        expect(screen.getByText(/too small/i)).toBeInTheDocument();
      });

      const publishBtn = screen.getByText(/publish/i);
      expect(publishBtn).toBeDisabled();
    });

    it('should enable publish when all validations pass', async () => {
      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Valid Poll' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Yes' } });
      fireEvent.change(optionInputs[1], { target: { value: 'No' } });

      // Wait for estimate
      await waitFor(() => {
        expect(screen.getByText(/privacy-safe/i)).toBeInTheDocument();
      });

      const publishBtn = screen.getByText(/publish/i);
      expect(publishBtn).not.toBeDisabled();
    });

    it('should publish poll with rewards successfully', async () => {
      global.confirm = vi.fn(() => true);

      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Rewarded Poll' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'Yes' } });
      fireEvent.change(optionInputs[1], { target: { value: 'No' } });

      // Enable rewards
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      fireEvent.click(rewardCheckbox);

      await waitFor(() => {
        const rewardAmountInput = screen.getByLabelText(/reward amount/i);
        fireEvent.change(rewardAmountInput, { target: { value: '25.00' } });
      });

      // Wait for estimate
      await waitFor(() => {
        expect(screen.getByText(/privacy-safe/i)).toBeInTheDocument();
      });

      // Mock successful creation and publish
      (adminPollsApi.create as any).mockResolvedValue({
        id: 'poll-published-123',
      });
      (adminPollsApi.publish as any).mockResolvedValue({
        id: 'poll-published-123',
        status: 'active',
      });

      const publishBtn = screen.getByText(/publish/i);
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(adminPollsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Rewarded Poll',
            rewards_enabled: true,
            reward_amount: 25.00,
            reward_token: 'DTG',
          })
        );
        expect(adminPollsApi.publish).toHaveBeenCalledWith('poll-published-123');
      });
    });
  });

  describe('Reward Fields Persistence', () => {
    it('should persist reward amount and token changes', async () => {
      render(<CreatePoll />);

      // Enable rewards
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      fireEvent.click(rewardCheckbox);

      // Change reward amount
      await waitFor(() => {
        const rewardAmountInput = screen.getByLabelText(/reward amount/i);
        fireEvent.change(rewardAmountInput, { target: { value: '15.75' } });
        expect(rewardAmountInput).toHaveValue(15.75);
      });

      // Change token
      await waitFor(() => {
        const tokenSelect = screen.getByLabelText(/token/i);
        fireEvent.change(tokenSelect, { target: { value: 'ETH' } });
        expect(tokenSelect).toHaveValue('ETH');
      });
    });

    it('should hide reward fields when rewards disabled', async () => {
      render(<CreatePoll />);

      // Reward amount should not be visible initially
      expect(screen.queryByLabelText(/reward amount/i)).not.toBeInTheDocument();

      // Enable rewards
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      fireEvent.click(rewardCheckbox);

      // Now fields should appear
      await waitFor(() => {
        expect(screen.getByLabelText(/reward amount/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/token/i)).toBeInTheDocument();
      });

      // Disable rewards
      fireEvent.click(rewardCheckbox);

      // Fields should be hidden again
      await waitFor(() => {
        expect(screen.queryByLabelText(/reward amount/i)).not.toBeInTheDocument();
      });
    });

    it('should show reward preview when enabled', async () => {
      render(<CreatePoll />);

      const titleInput = screen.getByLabelText(/poll title/i);
      fireEvent.change(titleInput, { target: { value: 'Preview Test' } });

      const optionInputs = screen.getAllByPlaceholderText(/option \d+/i);
      fireEvent.change(optionInputs[0], { target: { value: 'A' } });
      fireEvent.change(optionInputs[1], { target: { value: 'B' } });

      // Enable rewards
      const rewardCheckbox = screen.getByLabelText(/enable rewards/i);
      fireEvent.click(rewardCheckbox);

      await waitFor(() => {
        const rewardAmountInput = screen.getByLabelText(/reward amount/i);
        fireEvent.change(rewardAmountInput, { target: { value: '5.00' } });
      });

      // Wait for estimate to complete
      await waitFor(() => {
        expect(screen.getByText(/privacy-safe/i)).toBeInTheDocument();
      });

      // Reward preview should be visible
      await waitFor(() => {
        expect(screen.getByText(/reward per vote/i)).toBeInTheDocument();
        expect(screen.getByText(/5.00 DTG/i)).toBeInTheDocument();
      });
    });
  });
});

