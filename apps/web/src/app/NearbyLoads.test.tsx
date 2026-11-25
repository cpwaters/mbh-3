import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Listing } from '@mbh/domain';
import NearbyLoads from './NearbyLoads';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

// Leaflet does not render in jsdom; the map is checked by what it is given.
const mapProps = vi.fn();
vi.mock('./NearbyMap', () => ({
  default: (props: { radiusMiles: number; loads: { listing: Listing }[] }) => {
    mapProps(props);
    return <div data-testid="map">{props.loads.length} pins</div>;
  },
}));

// The phone is in Manchester city centre. Pickups placed by postcode:
// Trafford ~3.5 miles, Bolton ~10.2, Preston ~30, Leeds ~36.
const PLACES: Record<string, { lat: number; lng: number }> = {
  'M17 1WS': { lat: 53.4697, lng: -2.3266 },
  'BL1 1AA': { lat: 53.578, lng: -2.429 },
  'PR1 2AB': { lat: 53.7632, lng: -2.7031 },
  'LS1 4AP': { lat: 53.7965, lng: -1.5478 },
};
const lookups = vi.fn();
let lookupFails = false;
vi.mock('../lib/geocode', () => ({
  lookupPostcode: async (postcode: string) => {
    lookups(postcode);
    if (lookupFails) return 'unavailable';
    return PLACES[postcode] ?? null;
  },
}));

const MANCHESTER = { lat: 53.4808, lng: -2.2426 };

const load = (loadId: string, town: string, postcode: string): Listing => ({
  loadId,
  shipperTenantId: 'acme',
  origin: { town, postcode },
  destination: { town: 'Leith', postcode: 'EH6 6JJ' },
  description: 'Pallets',
  weightKg: 12_000,
  palletCount: 14,
  priceGbpPence: 68_000,
  pickupBy: '2026-11-25',
  deliverBy: '2026-11-26',
  postedAt: '2026-11-24T09:00:00.000Z',
});

const LISTINGS = [
  load('trafford', 'Trafford', 'M17 1WS'),
  load('bolton', 'Bolton', 'BL1 1AA'),
  load('preston', 'Preston', 'PR1 2AB'),
  load('leeds', 'Leeds', 'LS1 4AP'),
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mapProps.mockClear();
  lookups.mockClear();
  lookupFails = false;
  fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { jobId: 'job-1' } }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function renderNearby(over: Partial<ReturnType<typeof makeMockApp>> = {}) {
  const app = { ...makeMockApp(), listings: LISTINGS, location: MANCHESTER, ...over };
  render(
    <AppProvider value={app}>
      <MemoryRouter>
        <NearbyLoads />
      </MemoryRouter>
    </AppProvider>
  );
  return app;
}

describe('Loads near you', () => {
  it('asks for location before it can say what is near', async () => {
    const user = userEvent.setup();
    const requestLocation = vi.fn();
    renderNearby({ location: null, requestLocation });
    expect(screen.getByRole('heading', { name: 'Loads near you' })).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enable location' }));
    expect(requestLocation).toHaveBeenCalled();
  });

  it('shows the loads within 25 miles by default, nearest first, and counts the rest', async () => {
    renderNearby();
    expect(await screen.findByRole('heading', { name: '2 loads within 25 miles' })).toBeInTheDocument();
    const towns = screen.getAllByText(/^(Trafford|Bolton|Preston|Leeds), /).map((el) => el.textContent);
    expect(towns).toEqual(['Trafford, M17 1WS', 'Bolton, BL1 1AA']);
    expect(screen.getByText(/2 more further away — widen the distance/)).toBeInTheDocument();
    expect(screen.getByText(/Collection 3\.\d miles away/)).toBeInTheDocument();
    // The map is given the same loads and the radius to draw.
    expect(mapProps).toHaveBeenLastCalledWith(expect.objectContaining({ radiusMiles: 25 }));
    expect(screen.getByTestId('map')).toHaveTextContent('2 pins');
  });

  it('says the vehicle a load needs, in one line', async () => {
    renderNearby({
      listings: [
        { ...load('trafford', 'Trafford', 'M17 1WS'), vehicleSizes: ['artic'], vehicleTypes: ['refrigerated'] },
        { ...load('bolton', 'Bolton', 'BL1 1AA'), vehicleSizes: [], vehicleTypes: [] },
      ],
    });
    await screen.findByRole('heading', { name: '2 loads within 25 miles' });
    expect(screen.getByText('Artic · Refrigerated')).toBeInTheDocument();
    expect(screen.getByText('Any vehicle')).toBeInTheDocument();
  });

  it('narrows the map and the list to the vehicle types picked', async () => {
    const user = userEvent.setup();
    renderNearby({
      listings: [
        { ...load('trafford', 'Trafford', 'M17 1WS'), vehicleTypes: ['tanker'] },
        { ...load('bolton', 'Bolton', 'BL1 1AA'), vehicleTypes: ['box'] },
      ],
    });
    await screen.findByRole('heading', { name: '2 loads within 25 miles' });
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Box' }));
    expect(screen.getByRole('heading', { name: '1 load within 25 miles' })).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveTextContent('1 pin');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
  });

  it('widens to the radius chosen, and remembers it', async () => {
    const user = userEvent.setup();
    renderNearby();
    await screen.findByRole('heading', { name: '2 loads within 25 miles' });
    await user.click(screen.getByRole('button', { name: '50 miles' }));
    expect(screen.getByRole('heading', { name: '4 loads within 50 miles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50 miles' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('mbh.nearbyRadiusMiles')).toBe('50');

    await user.click(screen.getByRole('button', { name: '10 miles' }));
    expect(screen.getByRole('heading', { name: '1 load within 10 miles' })).toBeInTheDocument();
  });

  it('opens on the radius chosen last time', async () => {
    window.localStorage.setItem('mbh.nearbyRadiusMiles', '100');
    renderNearby();
    expect(await screen.findByRole('heading', { name: '4 loads within 100 miles' })).toBeInTheDocument();
  });

  it('accepts a load from here through dispatch', async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    renderNearby({ onAccepted });
    await screen.findByRole('heading', { name: '2 loads within 25 miles' });
    await user.click(screen.getAllByRole('button', { name: 'Accept Load' })[0] as HTMLElement);
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      type: string;
      payload: { loadId: string };
    };
    expect(body).toMatchObject({ type: 'acceptLoad', payload: { loadId: 'trafford' } });
  });

  it('will not accept while a job is in progress', async () => {
    renderNearby({ job: { jobId: 'j' } as never });
    await screen.findByRole('heading', { name: '2 loads within 25 miles' });
    for (const button of screen.getAllByRole('button', { name: 'Accept Load' })) expect(button).toBeDisabled();
    expect(screen.getByText(/job in progress/)).toBeInTheDocument();
  });

  it('plots a load from the point the server gave it, without looking its postcode up', async () => {
    const placed = { ...load('placed', 'Nowhere', 'ZZ9 9ZZ'), collectionPoint: { lat: 53.47, lng: -2.25 } };
    renderNearby({ listings: [placed] });
    expect(await screen.findByRole('heading', { name: '1 load within 25 miles' })).toBeInTheDocument();
    expect(lookups).not.toHaveBeenCalledWith('ZZ9 9ZZ');
    expect(mapProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ loads: [expect.objectContaining({ pickup: { lat: 53.47, lng: -2.25 } })] })
    );
  });
});

describe('Loads near you — around a postcode', () => {
  it('plots loads around a postcode the driver types, with no GPS fix at all', async () => {
    const user = userEvent.setup();
    renderNearby({ location: null });
    await user.click(screen.getByRole('button', { name: 'A postcode' }));
    await user.type(screen.getByRole('textbox', { name: 'Postcode to search around' }), 'pr1 2ab');
    await user.click(screen.getByRole('button', { name: 'Show loads' }));

    // Around Preston at 25 miles: Preston itself and Bolton; Trafford is ~27.
    expect(await screen.findByText(/within 25 miles/)).toHaveTextContent('2 loads within 25 miles of PR1 2AB');
    expect(screen.getByTestId('map')).toHaveTextContent('2 pins');
    expect(mapProps).toHaveBeenLastCalledWith(expect.objectContaining({ centreLabel: 'PR1 2AB' }));
    expect(screen.getAllByText(/Collection .* from PR1 2AB/).length).toBeGreaterThan(0);
  });

  it('remembers the postcode, and reopens on it', async () => {
    const user = userEvent.setup();
    renderNearby({ location: null });
    await user.click(screen.getByRole('button', { name: 'A postcode' }));
    await user.type(screen.getByRole('textbox', { name: 'Postcode to search around' }), 'PR1 2AB');
    await user.click(screen.getByRole('button', { name: 'Show loads' }));
    await screen.findByText(/of PR1 2AB/);
    expect(JSON.parse(window.localStorage.getItem('mbh.nearbyArea') ?? '{}')).toEqual({ around: 'postcode', postcode: 'PR1 2AB' });
  });

  it('says so when the postcode does not exist, or cannot be looked up', async () => {
    const user = userEvent.setup();
    renderNearby({ location: null });
    await user.click(screen.getByRole('button', { name: 'A postcode' }));
    await user.type(screen.getByRole('textbox', { name: 'Postcode to search around' }), 'XX1 1XX');
    await user.click(screen.getByRole('button', { name: 'Show loads' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t find that postcode/);

    lookupFails = true;
    await user.click(screen.getByRole('button', { name: 'Show loads' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/check your signal/);
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});
