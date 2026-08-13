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

  it('drops make/model/year/registration for a trailer, keeping the configuration', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/vehicle type/i), 'trailer');

    expect(screen.getByLabelText(/vehicle configuration/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/registration number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^make/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^model/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^year/i)).not.toBeInTheDocument();
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
