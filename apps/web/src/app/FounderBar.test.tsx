import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FounderBar } from './FounderBar';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

const testEmailTaskStatus = vi.fn();
vi.mock('../lib/reader', () => ({
  getReader: () => ({ testEmailTaskStatus: (...args: unknown[]) => testEmailTaskStatus(...args) }),
}));

function renderFounderBar(over: Parameters<typeof makeMockApp>[0] = {}) {
  return render(
    <AppProvider value={makeMockApp(over)}>
      <MemoryRouter>
        <FounderBar />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  testEmailTaskStatus.mockReset();
});

describe('FounderBar — send test email', () => {
  it('dispatches sendTestInvoiceEmail for the selected tenant, then polls through to a real "sent" outcome', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { taskId: 'task-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    testEmailTaskStatus.mockResolvedValue({ status: 'done' });
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dispatch',
      expect.objectContaining({
        body: expect.stringContaining('"type":"sendTestInvoiceEmail"'),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { payload: { tenantId: string } };
    expect(body.payload).toEqual({ tenantId: 'carrier-sb' });

    // Polling picks up the drain's real outcome — not a permanent "Queued"
    // that never resolves either way.
    await waitFor(() => expect(screen.getByText(/sent — check the inbox/i)).toBeInTheDocument());
    expect(testEmailTaskStatus).toHaveBeenCalledWith('task-1');
  });

  it('shows a waiting state while the drain hasn\'t resolved the task yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { taskId: 'task-3' } }) }));
    // Never resolves during this test — the drain hasn't run yet.
    testEmailTaskStatus.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(screen.getByText(/waiting for the drain/i)).toBeInTheDocument());
  });

  it('surfaces the drain\'s lastError when the task ends up failed (e.g. a real SMTP rejection), instead of leaving "Queued" showing forever', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { taskId: 'task-2' } }) }));
    testEmailTaskStatus.mockResolvedValue({ status: 'failed', lastError: 'SMTP send failed: 535 Authentication unsuccessful' });
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() =>
      expect(screen.getByText(/Failed: SMTP send failed: 535 Authentication unsuccessful/)).toBeInTheDocument()
    );
  });

  it('shows the server error message when the dispatch is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'conflict', message: 'Add an email address to your profile first, then try again.' } }),
      })
    );
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() =>
      expect(screen.getByText('Add an email address to your profile first, then try again.')).toBeInTheDocument()
    );
    expect(testEmailTaskStatus).not.toHaveBeenCalled();
  });

  it('refuses to send without a selected tenant, without making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderFounderBar({ selected: null });

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(screen.getByText('Select a company first.')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('FounderBar — backfill closures', () => {
  it('dispatches backfillCloseJobs for the selected tenant and reports how many jobs were queued', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { jobIds: ['job-1', 'job-2'] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /backfill closures/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dispatch',
      expect.objectContaining({ body: expect.stringContaining('"type":"backfillCloseJobs"') })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { payload: { tenantId: string } };
    expect(body.payload).toEqual({ tenantId: 'carrier-sb' });

    await waitFor(() => expect(screen.getByText(/queued 2 job\(s\)/i)).toBeInTheDocument());
  });

  it('reports nothing stuck when no jobs were found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { jobIds: [] } }) }));
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /backfill closures/i }));

    await waitFor(() => expect(screen.getByText(/nothing stuck/i)).toBeInTheDocument());
  });

  it('refuses without a selected tenant, without making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderFounderBar({ selected: null });

    await user.click(screen.getByRole('button', { name: /backfill closures/i }));

    await waitFor(() => expect(screen.getByText('Select a company first.')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
