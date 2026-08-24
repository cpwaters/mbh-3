import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

const profileForActor = vi.fn().mockResolvedValue(null);
const vehiclesForTenant = vi.fn().mockResolvedValue([]);
vi.mock('../lib/reader', () => ({
  getReader: () => ({
    profileForActor: (...args: unknown[]) => profileForActor(...args),
    vehiclesForTenant: (...args: unknown[]) => vehiclesForTenant(...args),
  }),
}));

function renderProfile(over: Parameters<typeof makeMockApp>[0] = {}) {
  return render(
    <AppProvider value={makeMockApp(over)}>
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDispatch(inviteId = 'inv-xyz') {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ json: async () => ({ ok: true, result: { inviteId, expiresAt: '2026-09-01T00:00:00.000Z' } }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Profile — inviting a company in', () => {
  it('offers the button to a carrier', async () => {
    renderProfile({ isCarrier: true, isShipper: false });
    await waitFor(() => expect(screen.getByRole('button', { name: /invite a company/i })).toBeInTheDocument());
  });

  it('offers it to a shipper too — vouching works both ways', async () => {
    renderProfile({ isCarrier: false, isShipper: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /invite a company/i })).toBeInTheDocument());
  });

  it('does not offer it before a company is selected', async () => {
    renderProfile({ selected: null });
    await waitFor(() => expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /invite a company/i })).not.toBeInTheDocument();
  });

  it('mints a link for the selected company and shows it to send on', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // After setup(): user-event installs its own clipboard stub.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderProfile({ isCarrier: true, isShipper: false });

    await waitFor(() => expect(screen.getByRole('button', { name: /invite a company/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /invite a company/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      type: string;
      payload: Record<string, string>;
    };
    expect(body.type).toBe('createInvite');
    // Sent against the company being acted as — that is what authorizes it.
    expect(body.payload).toMatchObject({ tenantId: 'carrier-sb' });

    await waitFor(() => expect(screen.getByText(/\/app\/invite\/inv-xyz$/)).toBeInTheDocument());
    expect(screen.getByText(/expires in 7 days/i)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/app/invite/inv-xyz'));
  });

  it("surfaces the server's refusal rather than showing a link that does not exist", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }),
      })
    );
    const user = userEvent.setup();
    renderProfile({ isCarrier: true, isShipper: false });

    await waitFor(() => expect(screen.getByRole('button', { name: /invite a company/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /invite a company/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/does not permit/i));
    expect(screen.queryByText(/\/app\/invite\//)).not.toBeInTheDocument();
  });
});
