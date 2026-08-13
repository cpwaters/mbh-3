import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AddVehicle from './AddVehicle';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

function renderPage() {
  return render(
    <AppProvider value={makeMockApp({ isShipper: false, isCarrier: true })}>
      <MemoryRouter>
        <AddVehicle />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDispatch() {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { vehicleId: 'veh-9' } }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentPayload = (fetchMock: ReturnType<typeof stubDispatch>) =>
  (JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { payload: Record<string, unknown> }).payload;

describe('AddVehicle — a type only asks for what it needs', () => {
  it('asks a rigid for both its plate details and its configuration', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'rigid');

    expect(screen.getByLabelText(/vehicle configuration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/registration number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^make/i)).toBeInTheDocument();
  });

  it('drops make/model/year/registration for a trailer, asking for its number instead', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');

    expect(screen.getByLabelText(/vehicle configuration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/trailer number/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/registration number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^make/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^model/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^year/i)).not.toBeInTheDocument();
  });

  it('asks nothing about a trailer number for anything that carries a plate', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'rigid');
    expect(screen.queryByLabelText(/trailer number/i)).not.toBeInTheDocument();
  });

  it('sends a trailer with its number and no plate details', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');
    await user.selectOptions(screen.getByLabelText(/vehicle configuration/i), 'curtain sider');
    await user.type(screen.getByLabelText(/trailer number/i), 'TR-114');
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentPayload(fetchMock)).toMatchObject({
      vehicleType: 'trailer',
      vehicleConfiguration: 'curtain sider',
      trailerNumber: 'TR-114',
      registration: '',
      make: '',
    });
  });

  it('does not smuggle a trailer number through a switch back to a rigid', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');
    await user.type(screen.getByLabelText(/trailer number/i), 'TR-114');

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'rigid');
    await user.selectOptions(screen.getByLabelText(/vehicle configuration/i), 'box');
    await user.type(screen.getByLabelText(/registration number/i), 'AB12 CDE');
    await user.type(screen.getByLabelText(/^make/i), 'Volvo');
    await user.type(screen.getByLabelText(/^model/i), 'FL');
    await user.type(screen.getByLabelText(/^year/i), '2021');
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentPayload(fetchMock)).toMatchObject({ vehicleType: 'rigid', trailerNumber: '' });
  });

  it('lets a shipper add a vehicle to its own fleet', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    render(
      <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
        <MemoryRouter>
          <AddVehicle />
        </MemoryRouter>
      </AppProvider>
    );

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');
    await user.selectOptions(screen.getByLabelText(/vehicle configuration/i), 'flatbed');
    await user.type(screen.getByLabelText(/trailer number/i), 'TR-200');
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string };
    expect(body.type).toBe('addVehicle');
    expect(sentPayload(fetchMock)).toMatchObject({ carrierTenantId: 'carrier-sb', trailerNumber: 'TR-200' });
  });

  it('drops the configuration for a unit, keeping its plate details', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'unit');

    expect(screen.queryByLabelText(/vehicle configuration/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/registration number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^make/i)).toBeInTheDocument();
  });

  it('does not smuggle a rigid’s typed plate through a switch to trailer', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'rigid');
    await user.type(screen.getByLabelText(/registration number/i), 'AB12 CDE');
    await user.type(screen.getByLabelText(/^make/i), 'Volvo');

    // Changing your mind must not leave the old truck's identity attached.
    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');
    await user.selectOptions(screen.getByLabelText(/vehicle configuration/i), 'refrigerated');
    await user.type(screen.getByLabelText(/trailer number/i), 'TR-114');
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentPayload(fetchMock)).toMatchObject({
      vehicleType: 'trailer',
      vehicleConfiguration: 'refrigerated',
      registration: '',
      make: '',
      model: '',
      year: 0,
    });
  });

  it('sends a unit with an empty configuration', async () => {
    const fetchMock = stubDispatch();
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'unit');
    await user.type(screen.getByLabelText(/registration number/i), 'AB12 CDE');
    await user.type(screen.getByLabelText(/^make/i), 'Volvo');
    await user.type(screen.getByLabelText(/^model/i), 'FH16');
    await user.type(screen.getByLabelText(/^year/i), '2020');
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentPayload(fetchMock)).toMatchObject({
      vehicleType: 'unit',
      vehicleConfiguration: '',
      registration: 'AB12 CDE',
      make: 'Volvo',
      year: 2020,
    });
  });
});
