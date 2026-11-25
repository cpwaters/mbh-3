import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';
import { RoleBanner } from './RoleBanner';

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

  it('gives a company that both ships and carries its own title, on the two colours joined', () => {
    renderBanner(company(['shipper', 'carrier']));
    const banner = screen.getByRole('note', { name: 'Signed in as a shipper and carrier' });
    expect(banner).toHaveTextContent('Shipper & Carrier');
    expect(banner).toHaveClass('bg-gradient-to-r', 'from-indigo-950', 'to-blue-600');
  });

  it('shows nothing before a company is selected', () => {
    renderBanner({ selected: null });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
