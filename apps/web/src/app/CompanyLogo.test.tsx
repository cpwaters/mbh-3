import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyLogo from './CompanyLogo';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

const upload = vi.fn().mockResolvedValue(undefined);
const viewUrl = vi.fn().mockResolvedValue('blob:stored-logo');
vi.mock('../lib/object-storage', () => ({
  getObjectStorageUploader: () => ({
    upload: (...args: unknown[]) => upload(...args),
    viewUrl: (...args: unknown[]) => viewUrl(...args),
  }),
}));

const carrier = {
  tenantId: 'carrier-sb',
  name: 'Waters Haulage',
  role: 'driver' as const,
  capabilities: ['carrier' as const],
};

function renderLogo(over: Parameters<typeof makeMockApp>[0] = {}) {
  const app = makeMockApp({ selected: carrier, reloadTenants: vi.fn(), ...over });
  return { app, ...render(<AppProvider value={app}><CompanyLogo tenantId="carrier-sb" /></AppProvider>) };
}

function pngFile(name = 'logo.png', bytes = 1024, type = 'image/png'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function stubDispatch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => (ok ? { ok: true, result: {} } : { ok: false, error: { message: 'nope' } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  upload.mockReset().mockResolvedValue(undefined);
  viewUrl.mockReset().mockResolvedValue('blob:stored-logo');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CompanyLogo', () => {
  it('says what a logo is for, and that there is none yet', async () => {
    renderLogo();
    expect(screen.getByText(/no logo yet/i)).toBeInTheDocument();
    // The fallback is stated plainly rather than left as a surprise.
    expect(screen.getByText(/carry the MyBackHaul logo/i)).toBeInTheDocument();
  });

  it('shows the logo the company has already saved', async () => {
    renderLogo({ selected: { ...carrier, logoRef: 'company-logos/carrier-sb/req-1.png' } });
    await waitFor(() => expect(screen.getByAltText(/your company logo/i)).toHaveAttribute('src', 'blob:stored-logo'));
    expect(screen.queryByText(/no logo yet/i)).not.toBeInTheDocument();
  });

  it('uploads the file, then records the ref through dispatch', async () => {
    const user = userEvent.setup();
    const fetchMock = stubDispatch();
    const { app } = renderLogo();

    await user.upload(screen.getByLabelText(/upload logo/i), pngFile());

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const [ref, , contentType] = upload.mock.calls[0] as [string, File, string];
    expect(ref).toMatch(/^company-logos\/carrier-sb\//);
    expect(contentType).toBe('image/png');

    // The same ref the bytes went to is what gets recorded — and it goes
    // through dispatch, not straight to Firestore.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      type: string;
      payload: { tenantId: string; logoRef: string; contentType: string };
    };
    expect(body.type).toBe('setCompanyLogo');
    expect(body.payload).toMatchObject({ tenantId: 'carrier-sb', logoRef: ref, contentType: 'image/png' });
    await waitFor(() => expect(app.reloadTenants).toHaveBeenCalled());
  });

  it('refuses a format the invoice cannot render, without uploading anything', async () => {
    stubDispatch();
    renderLogo();

    // fireEvent rather than userEvent.upload: user-event honours the input's
    // `accept`, exactly as the OS picker does, so it would silently drop this
    // file and prove nothing. `accept` is only a filter on the dialog — drag
    // and drop, and "All files", both get past it — so the guard has to hold
    // when a file does arrive, which is what this checks.
    const input = screen.getByLabelText(/upload logo/i);
    fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG or JPEG/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses an oversized image, without uploading anything', async () => {
    const user = userEvent.setup();
    stubDispatch();
    renderLogo();

    await user.upload(screen.getByLabelText(/upload logo/i), pngFile('big.png', 3 * 1024 * 1024));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('reports a failed upload instead of recording a ref with no bytes behind it', async () => {
    const user = userEvent.setup();
    const fetchMock = stubDispatch();
    upload.mockRejectedValueOnce(new Error('offline'));
    renderLogo();

    await user.upload(screen.getByLabelText(/upload logo/i), pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not upload/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes a logo, so invoices go back to the MyBackHaul mark', async () => {
    const user = userEvent.setup();
    const fetchMock = stubDispatch();
    const { app } = renderLogo({ selected: { ...carrier, logoRef: 'company-logos/carrier-sb/req-1.png' } });

    await user.click(await screen.findByRole('button', { name: /remove/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as { type: string };
    expect(body.type).toBe('clearCompanyLogo');
    await waitFor(() => expect(app.reloadTenants).toHaveBeenCalled());
  });

  it('shows the empty state when the saved logo will not resolve', async () => {
    // The record says there is one but the object is gone — better to offer
    // an upload than to render a broken image.
    viewUrl.mockRejectedValueOnce(new Error('404'));
    renderLogo({ selected: { ...carrier, logoRef: 'company-logos/carrier-sb/gone.png' } });

    await waitFor(() => expect(screen.getByText(/no logo yet/i)).toBeInTheDocument());
  });
});
