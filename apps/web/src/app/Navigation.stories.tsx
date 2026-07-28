import type { Meta, StoryObj } from '@storybook/react';
import { Navigation } from './Navigation';
import DistributorNavigation from './distributor/Navigation';
import { withApp } from './stories/mock';

const meta: Meta = {
  title: 'Components/Navigation',
};
export default meta;

export const Driver: StoryObj = {
  decorators: [withApp({ isCarrier: true, isShipper: false })],
  render: () => <Navigation />,
};

export const DriverMultiTenant: StoryObj = {
  decorators: [
    withApp({
      tenants: [
        { tenantId: 'carrier-sb', name: 'Waters Haulage', role: 'driver', capabilities: ['carrier'] },
        { tenantId: 'shipper-sb', name: 'Acme Distribution', role: 'owner', capabilities: ['shipper'] },
      ],
      selected: { tenantId: 'carrier-sb', name: 'Waters Haulage', role: 'driver', capabilities: ['carrier'] },
    }),
  ],
  render: () => <Navigation />,
};

export const Distributor: StoryObj = {
  decorators: [
    withApp({
      isCarrier: false,
      isShipper: true,
      tenants: [{ tenantId: 'shipper-sb', name: 'Acme Distribution', role: 'owner', capabilities: ['shipper'] }],
      selected: { tenantId: 'shipper-sb', name: 'Acme Distribution', role: 'owner', capabilities: ['shipper'] },
    }),
  ],
  render: () => <DistributorNavigation />,
};
