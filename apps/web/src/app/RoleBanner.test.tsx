import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';
import { RoleBanner } from './RoleBanner';

function renderBanner(shipper: boolean, over: Parameters<typeof makeMockApp>[0] = {}) {
  return render(
    <AppProvider value={makeMockApp(over)}>
      <RoleBanner shipper={shipper} />
    </AppProvider>
  );
}

describe('RoleBanner', () => {
  it('tells a carrier they are working as a carrier, for which company, in blue', () => {
    renderBanner(false);
    const banner = screen.getByRole('note', { name: 'Signed in as a carrier' });
    expect(banner).toHaveTextContent('Carrier');
    expect(banner).toHaveClass('bg-blue-600');
  });

  it('tells a shipper they are working as a shipper, in the back office indigo', () => {
    renderBanner(true, {
      selected: { tenantId: 'shipper-1', name: 'Acme Foods', role: 'owner', capabilities: ['shipper'] },
    });
    const banner = screen.getByRole('note', { name: 'Signed in as a shipper' });
    expect(banner).toHaveTextContent('Shipper');
    expect(banner).toHaveTextContent('Acme Foods');
    expect(banner).toHaveClass('bg-indigo-950');
  });

  it('shows nothing before a company is selected', () => {
    renderBanner(false, { selected: null });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
