import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatePoll from '../pages/CreatePoll';
import { adminPollsApi, regionsApi } from '../api/client';

vi.mock('../api/client', () => ({
  adminPollsApi: {
    create: vi.fn(),
    estimate: vi.fn(),
    publish: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  },
  regionsApi: { list: vi.fn() },
}));

describe('CreatePoll release gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(regionsApi.list).mockResolvedValue([
      { id: '1', code: 'reg_tbilisi', name_en: 'Tbilisi', name_ka: 'თბილისი', active: true },
    ]);
    vi.mocked(adminPollsApi.estimate).mockResolvedValue({ count: 150, isPrivacySafe: true });
  });

  function fillValidSurvey() {
    fireEvent.change(screen.getByLabelText('Poll Title'), { target: { value: 'Secure poll' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your question...'), {
      target: { value: 'Which option do you support?' },
    });
    const options = screen.getAllByPlaceholderText(/Option \d+/);
    fireEvent.change(options[0], { target: { value: 'Option A' } });
    fireEvent.change(options[1], { target: { value: 'Option B' } });
  }

  function renderCreatePoll() {
    return render(
      <MemoryRouter>
        <CreatePoll />
      </MemoryRouter>
    );
  }

  async function waitForSafeAudience() {
    await waitFor(
      () => expect(screen.getByText(/Privacy-safe: Audience meets safety threshold/)).toBeInTheDocument(),
      { timeout: 2000 }
    );
  }

  it('saves a draft using the current survey question contract', async () => {
    vi.mocked(adminPollsApi.create).mockResolvedValue({ id: 'poll-1' } as never);
    renderCreatePoll();
    fireEvent.change(screen.getByLabelText('Poll Title'), { target: { value: 'Draft poll' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Draft context' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your question...'), {
      target: { value: 'Draft question?' },
    });
    const options = screen.getAllByPlaceholderText(/Option \d+/);
    fireEvent.change(options[0], { target: { value: 'Yes' } });
    fireEvent.change(options[1], { target: { value: 'No' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(adminPollsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Draft poll',
          description: 'Draft context',
          type: 'survey',
          questions: [
            expect.objectContaining({
              questionText: 'Draft question?',
              options: [
                expect.objectContaining({ optionText: 'Yes' }),
                expect.objectContaining({ optionText: 'No' }),
              ],
            }),
          ],
          rewards_enabled: false,
        })
      );
    });
  });

  it('keeps publish disabled until all survey and privacy gates pass', async () => {
    renderCreatePoll();
    await waitForSafeAudience();
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Poll Title'), { target: { value: 'Incomplete poll' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your question...'), {
      target: { value: 'Question without choices' },
    });
    expect(publish).toBeDisabled();

    const options = screen.getAllByPlaceholderText(/Option \d+/);
    fireEvent.change(options[0], { target: { value: 'A' } });
    fireEvent.change(options[1], { target: { value: 'B' } });
    expect(publish).toBeEnabled();
  });

  it('fails closed when the audience estimate is below the privacy threshold', async () => {
    vi.mocked(adminPollsApi.estimate).mockResolvedValue({ count: 12, isPrivacySafe: false });
    renderCreatePoll();
    fillValidSurvey();

    await waitFor(() => expect(screen.getByText('Small audience warning')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('creates then publishes only after explicit confirmation', async () => {
    vi.mocked(adminPollsApi.create).mockResolvedValue({ id: 'poll-123' } as never);
    vi.mocked(adminPollsApi.publish).mockResolvedValue({ id: 'poll-123' } as never);
    renderCreatePoll();
    fillValidSurvey();
    await waitForSafeAudience();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('cannot be edited'));
      expect(adminPollsApi.create).toHaveBeenCalled();
      expect(adminPollsApi.publish).toHaveBeenCalledWith('poll-123');
    });
  });

  it('persists a positive reward configuration and exposes a preview', async () => {
    vi.mocked(adminPollsApi.create).mockResolvedValue({ id: 'poll-reward' } as never);
    renderCreatePoll();
    fireEvent.click(screen.getByLabelText('Enable rewards for this poll'));
    fireEvent.change(screen.getByLabelText('Reward Amount'), { target: { value: '10.5' } });
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'USDC' } });
    await waitForSafeAudience();

    expect(screen.getByText('10.5 USDC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => {
      expect(adminPollsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rewards_enabled: true,
          reward_amount: 10.5,
          reward_token: 'USDC',
        })
      );
    });
  });

  it('rejects publishing with a zero-value reward', async () => {
    renderCreatePoll();
    fillValidSurvey();
    fireEvent.click(screen.getByLabelText('Enable rewards for this poll'));
    await waitForSafeAudience();

    expect(screen.getByLabelText('Reward Amount')).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });
});
