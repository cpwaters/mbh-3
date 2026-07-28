import type { Meta, StoryObj } from '@storybook/react';
import LiveLocationMap from './LiveLocationMap';

const meta: Meta<typeof LiveLocationMap> = {
  title: 'Components/LiveLocationMap',
  component: LiveLocationMap,
};
export default meta;

export const RouteTraffordToLeith: StoryObj = {
  render: () => (
    <div style={{ height: 480 }}>
      <LiveLocationMap
        origin={{ lat: 53.4673, lng: -2.2915, label: 'Trafford, M17 1WS' }}
        destination={{ lat: 55.9758, lng: -3.1706, label: 'Leith, EH6 6JJ' }}
      />
    </div>
  ),
};

export const WithCurrentLocation: StoryObj = {
  render: () => (
    <div style={{ height: 480 }}>
      <LiveLocationMap
        origin={{ lat: 53.4673, lng: -2.2915, label: 'Origin' }}
        destination={{ lat: 55.9758, lng: -3.1706, label: 'Destination' }}
        currentLocation={{ lat: 54.5, lng: -2.6, label: 'Driver' }}
      />
    </div>
  ),
};
