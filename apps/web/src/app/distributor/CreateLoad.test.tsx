import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateLoad from './CreateLoad';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

function renderCreateLoad(reuseFrom?: Record<string, string>) {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={[{ pathname: '/create', state: reuseFrom ? { reuseFrom } : undefined }]}>
        <Routes>
          <Route path="/create" element={<CreateLoad />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('CreateLoad — reused addresses', () => {
  it('prefills the address fields from router state, leaving weight/pallets/dates blank for a fresh entry', () => {
    renderCreateLoad({
      source_company_name: 'Tesco Distribution',
      source_street: '10 Distribution Way',
      source_town: 'Trafford',
      source_city: 'Trafford',
      source_postcode: 'M17 1WS',
      source_contact_name: 'John Smith',
      source_contact_email: 'john@tesco.test',
      source_contact_phone: '020 1234 5678',
      destination_company_name: 'Asda Leith',
      destination_street: '5 Harbour Road',
      destination_town: 'Leith',
      destination_city: 'Leith',
      destination_postcode: 'EH6 6JJ',
      destination_contact_name: 'Sarah Johnson',
      destination_contact_email: 'sarah@asda.test',
      destination_contact_phone: '0161 234 5678',
    });

    expect(screen.getByText(/addresses carried over from a previous load/i)).toBeInTheDocument();

    expect(byId('source_company_name')).toHaveValue('Tesco Distribution');
    expect(byId('source_street')).toHaveValue('10 Distribution Way');
    expect(byId('source_city')).toHaveValue('Trafford');
    expect(byId('source_postcode')).toHaveValue('M17 1WS');
    expect(byId('source_contact_email')).toHaveValue('john@tesco.test');
    expect(byId('destination_company_name')).toHaveValue('Asda Leith');
    expect(byId('destination_postcode')).toHaveValue('EH6 6JJ');

    // Explicitly left for the shipper to fill in fresh.
    expect(byId('weight_kg')).toHaveValue(null);
    expect(byId('pallet_count')).toHaveValue(null);
    expect(byId('pickup_date')).toHaveValue('');
    expect(byId('pickup_time')).toHaveValue('');
    expect(byId('delivery_date')).toHaveValue('');
    expect(byId('delivery_time')).toHaveValue('');
  });

  it('renders a normal blank form (no reuse banner) when navigated to directly', () => {
    renderCreateLoad();

    expect(screen.queryByText(/addresses carried over/i)).not.toBeInTheDocument();
    expect(byId('source_company_name')).toHaveValue('');
  });
});
