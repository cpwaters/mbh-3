import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FounderBar } from './FounderBar';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

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
});

describe('FounderBar — send test email', () => {
  it('dispatches sendTestInvoiceEmail for the selected tenant and shows a queued confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { taskId: 'task-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderFounderBar();

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(screen.getByText(/queued/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dispatch',
      expect.objectContaining({
        body: expect.stringContaining('"type":"sendTestInvoiceEmail"'),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { payload: { tenantId: string } };
    expect(body.payload).toEqual({ tenantId: 'carrier-sb' });
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
