import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FOUNDER_EMAIL } from '@mbh/domain';
import { AdminLayout } from './AdminLayout';
import { AdminTools } from './AdminTools';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const testEmailTaskStatus = vi.fn().mockResolvedValue({ status: 'pending' });
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ testEmailTaskStatus: (...args: unknown[]) => testEmailTaskStatus(...args) }),
}));

const founderSession = { actorId: 'f-1', email: FOUNDER_EMAIL, displayName: 'Founder' };
const strangerSession = { actorId: 'u-1', email: 'someone@haulier.test', displayName: 'Someone' };

function renderAdmin(session: typeof founderSession | null, initial = '/admin') {
  const base = makeMockApp();
  const app = { ...base, auth: { ...base.auth, session } };
  return render(
    <AppProvider value={app}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="tools" element={<AdminTools />} />
            <Route index element={<p>Overview content</p>} />
          </Route>
          <Route path="/" element={<p>The app</p>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  testEmailTaskStatus.mockReset().mockResolvedValue({ status: 'pending' });
  vi.unstubAllGlobals();
});

function stubDispatch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => (ok ? { ok: true, result: { taskId: 'task-1' } } : { ok: false, error: { message: 'nope' } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminLayout — who gets in', () => {
  it('lets the founder in', () => {
    renderAdmin(founderSession);
    expect(screen.getByText('MyBackHaul admin')).toBeInTheDocument();
    expect(screen.getByText('Overview content')).toBeInTheDocument();
  });

  it('turns anyone else away, without telling them what they missed', () => {
    // Sent back to their own app rather than shown a locked door: saying "you
    // are not allowed in here" only advertises that here exists.
    renderAdmin(strangerSession);
    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(screen.queryByText('MyBackHaul admin')).not.toBeInTheDocument();
  });

  it('turns away a signed-out visitor too', () => {
    renderAdmin(null);
    expect(screen.getByText('The app')).toBeInTheDocument();
  });

  it('offers a way out, so the back office is not a room with one door', () => {
    renderAdmin(founderSession);
    expect(screen.getByRole('link', { name: /back to the app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});

describe('AdminTools — the test invoice', () => {
  it('dispatches the send and then waits on the drain rather than claiming success', async () => {
    // A send that merely enqueues proves nothing about whether it arrived,
    // which is the entire point of this tool.
    const user = userEvent.setup();
    const fetchMock = stubDispatch();
    renderAdmin(founderSession, '/admin/tools');

    await user.click(screen.getByRole('button', { name: /send test invoice/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as { type: string };
    expect(body.type).toBe('sendTestInvoiceEmail');
    expect(await screen.findByText(/waiting for the drain/i)).toBeInTheDocument();
  });

  it('reports the drain’s verdict when it lands', async () => {
    const user = userEvent.setup();
    stubDispatch();
    testEmailTaskStatus.mockResolvedValue({ status: 'done' });
    renderAdmin(founderSession, '/admin/tools');

    await user.click(screen.getByRole('button', { name: /send test invoice/i }));
    expect(await screen.findByText(/sent — check the inbox/i)).toBeInTheDocument();
  });

  it('surfaces a failure with the drain’s reason, not a generic error', async () => {
    const user = userEvent.setup();
    stubDispatch();
    testEmailTaskStatus.mockResolvedValue({ status: 'failed', lastError: 'SMTP auth rejected' });
    renderAdmin(founderSession, '/admin/tools');

    await user.click(screen.getByRole('button', { name: /send test invoice/i }));
    expect(await screen.findByText(/smtp auth rejected/i)).toBeInTheDocument();
  });

  it('says which company to pick when none is selected', async () => {
    const user = userEvent.setup();
    stubDispatch();
    const base = makeMockApp({ selected: null });
    const app = { ...base, auth: { ...base.auth, session: founderSession } };
    render(
      <AppProvider value={app}>
        <MemoryRouter initialEntries={['/admin/tools']}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="tools" element={<AdminTools />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppProvider>
    );

    await user.click(screen.getByRole('button', { name: /send test invoice/i }));
    expect(await screen.findByText(/select a company first/i)).toBeInTheDocument();
  });
});
