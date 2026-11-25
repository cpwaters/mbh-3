import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';
import { RoleBanner } from './RoleBanner';

let shipperCarrier = false;
vi.mock('../lib/reader', () => ({
  getReader: () => ({ featureFlags: async () => ({ ratings: false, shipperCarrier }) }),
}));

afterEach(() => {
  shipperCarrier = false;
});

function renderBanner(over: Parameters<typeof makeMockApp>[0] = {}) {
  return render(
    <AppProvider value={makeMockApp(over)}>
      <RoleBanner />
    </AppProvider>
  );
}

const company = (capabilities: ('shipper' | 'carrier')[]) => ({
  selected: { tenantId: 't-1', name: 'Acme Foods', role: 'owner' as const, capabilities },
});

describe('RoleBanner', () => {
  it('tells a carrier they are working as a carrier, for which company, in blue', () => {
    renderBanner();
    const banner = screen.getByRole('note', { name: 'Signed in as a carrier' });
    expect(banner).toHaveTextContent('Carrier');
    expect(banner).toHaveTextContent('Waters Haulage');
    expect(banner).toHaveClass('bg-blue-600');
  });

  it('tells a shipper they are working as a shipper, in the back office indigo', () => {
    renderBanner(company(['shipper']));
    const banner = screen.getByRole('note', { name: 'Signed in as a shipper' });
    expect(banner).toHaveTextContent('Shipper');
    expect(banner).toHaveTextContent('Acme Foods');
    expect(banner).toHaveClass('bg-indigo-950');
  });

  it('with Shipper & Carrier accounts on, gives a company that does both its own title, on the two colours joined', async () => {
    shipperCarrier = true;
    renderBanner(company(['shipper', 'carrier']));
    const banner = await screen.findByRole('note', { name: 'Signed in as a shipper and carrier' });
    expect(banner).toHaveTextContent('Shipper & Carrier');
    expect(banner).toHaveClass('bg-gradient-to-r', 'from-indigo-950', 'to-blue-600');
  });

  it('with it off (the default), shows a company that does both as a carrier, the app it gets', async () => {
    renderBanner(company(['shipper', 'carrier']));
    const banner = screen.getByRole('note', { name: 'Signed in as a carrier' });
    expect(banner).toHaveClass('bg-blue-600');
    // And it stays that way once the switches have been read.
    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('Carrier'));
    expect(screen.queryByText('Shipper & Carrier')).not.toBeInTheDocument();
  });

  it('shows nothing before a company is selected', () => {
    renderBanner({ selected: null });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
