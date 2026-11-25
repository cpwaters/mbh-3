import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

const profileForActor = vi.fn().mockResolvedValue(null);
const vehiclesForTenant = vi.fn().mockResolvedValue([]);
const featureFlags = vi.fn().mockResolvedValue({ ratings: false });
vi.mock('../lib/reader', () => ({
  getReader: () => ({
    profileForActor: (...args: unknown[]) => profileForActor(...args),
    vehiclesForTenant: (...args: unknown[]) => vehiclesForTenant(...args),
    featureFlags: () => featureFlags(),
  }),
}));

function renderProfile(over: Parameters<typeof makeMockApp>[0] = {}, routerState: unknown = null) {
  return render(
    <AppProvider value={makeMockApp(over)}>
      <MemoryRouter initialEntries={[{ pathname: '/profile', state: routerState }]}>
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

describe('Profile — ADR certificate', () => {
  const base = { actorId: 'actor-1', firstName: 'Chris', lastName: 'Waters', email: 'c@example.com', rating: 0 };

  it('shows a certificate in date with its expiry', async () => {
    profileForActor.mockResolvedValueOnce({ ...base, adrCertificate: { number: 'ADR-778899', expiresOn: '2099-03-12' } });
    renderProfile();
    await waitFor(() => expect(screen.getByText('ADR-778899')).toBeInTheDocument());
    expect(screen.getByText('Valid until 12 March 2099')).toBeInTheDocument();
  });

  it('flags an expired certificate', async () => {
    profileForActor.mockResolvedValueOnce({ ...base, adrCertificate: { number: 'ADR-1', expiresOn: '2020-01-31' } });
    renderProfile();
    await waitFor(() => expect(screen.getByText(/Expired on 31 January 2020/)).toBeInTheDocument());
  });

  it('says one is needed for ADR loads when there is none', async () => {
    profileForActor.mockResolvedValueOnce({ ...base });
    renderProfile();
    await waitFor(() => expect(screen.getByText('Needed to accept ADR loads.')).toBeInTheDocument());
  });

  it('adds a certificate right from the profile page', async () => {
    profileForActor.mockResolvedValue({ ...base });
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { actorId: 'actor-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Add ADR certificate' }));
    await user.type(screen.getByLabelText('Certificate number'), 'ADR-555');
    await user.type(screen.getByLabelText('Expiry date'), '2029-06-30');
    await user.click(screen.getByRole('button', { name: 'Save certificate' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string; payload: unknown };
    expect(body.type).toBe('setAdrCertificate');
    expect(body.payload).toEqual({ adrCertificate: { number: 'ADR-555', expiresOn: '2029-06-30' } });
    // Re-read so the page shows what was saved.
    await waitFor(() => expect(profileForActor.mock.calls.length).toBeGreaterThan(1));
    profileForActor.mockResolvedValue(null);
  });

  it('opens the form straight away when sent from an ADR load', async () => {
    profileForActor.mockResolvedValueOnce({ ...base, adrCertificate: { number: 'ADR-1', expiresOn: '2020-01-31' } });
    renderProfile({}, { addAdr: true });
    expect(await screen.findByLabelText('Certificate number')).toHaveValue('ADR-1');
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('sends someone with no profile yet to fill it in first', async () => {
    profileForActor.mockResolvedValueOnce(null);
    renderProfile();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Add ADR certificate' }));
    expect(screen.queryByLabelText('Certificate number')).not.toBeInTheDocument();
  });
});

describe('Profile — ratings follow the founder’s switch', () => {
  const base = { actorId: 'actor-1', firstName: 'Chris', lastName: 'Waters', email: 'c@example.com', rating: 4.2 };

  it('shows no rating while Ratings is switched off', async () => {
    profileForActor.mockResolvedValueOnce({ ...base });
    renderProfile();
    await waitFor(() => expect(screen.getByText('Chris Waters')).toBeInTheDocument());
    await waitFor(() => expect(featureFlags).toHaveBeenCalled());
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
    expect(screen.queryByText('4.2')).not.toBeInTheDocument();
  });

  it('shows the stars once Ratings is switched on', async () => {
    featureFlags.mockResolvedValueOnce({ ratings: true });
    profileForActor.mockResolvedValueOnce({ ...base });
    renderProfile();
    expect(await screen.findByLabelText('Rating 4.2 out of 5')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });
});
