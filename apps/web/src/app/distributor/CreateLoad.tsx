import { useState } from 'react';
import { MapPin, Box, Building, Truck, CreditCard, PoundSterling } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { dispatchAction } from '../../lib/dispatch';

const INPUT = 'block w-full px-3 py-2 border border-gray-300 rounded-lg';

const empty = {
  source_company_name: '', source_company_id: '', source_street: '', source_town: '', source_city: '',
  source_postcode: '', source_contact_name: '', source_contact_email: '', source_contact_phone: '',
  destination_company_name: '', destination_company_id: '', destination_street: '', destination_town: '',
  destination_city: '', destination_postcode: '', destination_contact_name: '', destination_contact_email: '',
  destination_contact_phone: '', consignment_id: '', description: '', weight_kg: '', volume_m3: '',
  pallet_count: '', price: '', pickup_date: '', pickup_time: '', delivery_date: '', delivery_time: '',
  distance: '', special_instructions: '',
  vehicle_van: false, vehicle_rigid: false, vehicle_artic: false,
  refrigerated: false, box: false, flat_bed: false, low_loader: false, skeleton: false, tanker: false,
  invoiced: false, instant_payment: false,
};
type Form = typeof empty;

// Ported from the mbh-2 distributor prototype (distributor/src/pages/
// CreateLoad.tsx). Wired to mbh-3's postLoad — the core (origin/destination/
// consignment/price/dates) drives the marketplace; the rest rides along as
// posting details. A price field is added (mbh-3 requires it).
export default function CreateLoad() {
  const app = useApp();
  const shipperTenantId = app.selected?.tenantId ?? null;
  const [f, setF] = useState<Form>(empty);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: '' }));
  };
  const toggle = (k: keyof Form) => (e: { target: { checked: boolean } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.checked }));

  function text(name: keyof Form, label: string, required = false, type = 'text', placeholder = '') {
    return (
      <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && '*'}
        </label>
        <input
          id={name}
          type={type}
          value={f[name] as string}
          onChange={set(name)}
          placeholder={placeholder}
          className={`block w-full px-3 py-2 border ${errors[name] ? 'border-red-300' : 'border-gray-300'} rounded-lg`}
        />
        {errors[name] && <p className="mt-1 text-sm text-red-600">{errors[name]}</p>}
      </div>
    );
  }
  function check(name: keyof Form, label: string) {
    return (
      <label className="flex items-center">
        <input type="checkbox" checked={f[name] as boolean} onChange={toggle(name)} className="mr-2" />
        {label}
      </label>
    );
  }

  function validate(): boolean {
    const e: { [key: string]: string } = {};
    const req: (keyof Form)[] = [
      'source_company_name', 'source_street', 'source_city', 'source_postcode', 'source_contact_name', 'source_contact_email',
      'destination_company_name', 'destination_street', 'destination_city', 'destination_postcode',
      'destination_contact_name', 'destination_contact_email', 'description', 'weight_kg', 'price',
      'pickup_date', 'pickup_time', 'delivery_date', 'delivery_time',
    ];
    for (const k of req) if (!String(f[k]).trim()) e[k] = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (!validate()) return;
    if (shipperTenantId === null) {
      setErrors({ submit: 'Select a shipper company first.' });
      return;
    }
    setLoading(true);
    try {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'postLoad',
        {
          shipperTenantId,
          origin: { line1: f.source_street, town: f.source_city, postcode: f.source_postcode },
          destination: { line1: f.destination_street, town: f.destination_city, postcode: f.destination_postcode },
          consignment: {
            description: f.description,
            weightKg: Number(f.weight_kg),
            palletCount: parseInt(f.pallet_count, 10) || 1,
          },
          priceGbpPence: Math.round(Number(f.price) * 100),
          pickupBy: f.pickup_date,
          deliverBy: f.delivery_date,
          postingDetails: {
            sourceCompanyName: f.source_company_name,
            destinationCompanyName: f.destination_company_name,
            sourceContact: { name: f.source_contact_name, email: f.source_contact_email, phone: f.source_contact_phone },
            destinationContact: {
              name: f.destination_contact_name,
              email: f.destination_contact_email,
              phone: f.destination_contact_phone,
            },
            pickupTime: f.pickup_time,
            deliveryTime: f.delivery_time,
            distanceMiles: Number(f.distance) || 0,
            volumeM3: Number(f.volume_m3) || 0,
            specialInstructions: f.special_instructions,
            vehicleSizes: [f.vehicle_van && 'van', f.vehicle_rigid && 'rigid', f.vehicle_artic && 'artic'].filter(Boolean) as string[],
            vehicleTypes: [
              f.refrigerated && 'refrigerated', f.box && 'box', f.flat_bed && 'flat_bed',
              f.low_loader && 'low_loader', f.skeleton && 'skeleton', f.tanker && 'tanker',
            ].filter(Boolean) as string[],
            paymentType: { invoiced: f.invoiced, instantPayment: f.instant_payment },
          },
        },
        genRequestId()
      );
      if (res.ok) {
        setSuccessMessage('Load created successfully!');
        setF(empty);
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrors({ submit: res.error.message });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Load</h1>
        <p className="text-gray-600">Fill in all required fields to create a new load</p>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
      {errors.submit && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{errors.submit}</p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building className="w-5 h-5" />
            Source Company
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {text('source_company_name', 'Company Name', true, 'text', 'Tesco Distribution Centre')}
            {text('source_company_id', 'Company ID', false, 'text', 'TESCO-001')}
            {text('source_street', 'Street', true, 'text', '123 Distribution Way')}
            {text('source_town', 'Town', false, 'text', 'Dagenham')}
            {text('source_city', 'City', true, 'text', 'London')}
            {text('source_postcode', 'Postcode', true, 'text', 'RM10 7XS')}
            {text('source_contact_name', 'Contact Name', true, 'text', 'John Smith')}
            {text('source_contact_email', 'Contact Email', true, 'email', 'john.smith@tesco.com')}
            {text('source_contact_phone', 'Contact Phone', false, 'tel', '020 1234 5678')}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Destination Company
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {text('destination_company_name', 'Company Name', true, 'text', 'Asda Warehouse')}
            {text('destination_company_id', 'Company ID', false, 'text', 'ASDA-002')}
            {text('destination_street', 'Street', true, 'text', '45 Warehouse Road')}
            {text('destination_town', 'Town', false, 'text', 'Trafford')}
            {text('destination_city', 'City', true, 'text', 'Manchester')}
            {text('destination_postcode', 'Postcode', true, 'text', 'M17 1WS')}
            {text('destination_contact_name', 'Contact Name', true, 'text', 'Sarah Johnson')}
            {text('destination_contact_email', 'Contact Email', true, 'email', 'sarah.johnson@asda.com')}
            {text('destination_contact_phone', 'Contact Phone', false, 'tel', '0161 234 5678')}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Box className="w-5 h-5" />
            Consignment Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {text('consignment_id', 'Consignment ID', false, 'text', 'CONS-2025-001')}
            {text('weight_kg', 'Weight (kg)', true, 'number', '19000')}
            {text('volume_m3', 'Volume (m³)', false, 'number', '45')}
            {text('pallet_count', 'Pallet Count', false, 'number', '21')}
            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
              <textarea
                id="description"
                value={f.description}
                onChange={set('description')}
                rows={3}
                placeholder="Mixed groceries and household items"
                className={`block w-full px-3 py-2 border ${errors.description ? 'border-red-300' : 'border-gray-300'} rounded-lg`}
              />
              {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PoundSterling className="w-5 h-5" />
            Payment Amount
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{text('price', 'Payment (£)', true, 'number', '680')}</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Pickup</h3>
              <div className="space-y-3">
                {text('pickup_date', 'Date', true, 'date')}
                {text('pickup_time', 'Time', true, 'time')}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Delivery</h3>
              <div className="space-y-3">
                {text('delivery_date', 'Date', true, 'date')}
                {text('delivery_time', 'Time', true, 'time')}
              </div>
            </div>
          </div>
          <div className="mt-4">{text('distance', 'Distance (miles)', false, 'number', '208')}</div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Special Instructions</label>
            <textarea
              value={f.special_instructions}
              onChange={set('special_instructions')}
              rows={2}
              placeholder="Refrigerated goods - maintain 2-8°C throughout transit"
              className={INPUT}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Vehicle Requirements
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Vehicle Size</h3>
              <div className="flex gap-4">
                {check('vehicle_van', 'Van')}
                {check('vehicle_rigid', 'Rigid')}
                {check('vehicle_artic', 'Artic')}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Vehicle Type</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {check('refrigerated', 'Refrigerated')}
                {check('box', 'Box')}
                {check('flat_bed', 'Flat Bed')}
                {check('low_loader', 'Low Loader')}
                {check('skeleton', 'Skeleton')}
                {check('tanker', 'Tanker')}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment Type
          </h2>
          <div className="flex gap-4">
            {check('invoiced', 'Invoiced')}
            {check('instant_payment', 'Instant Payment')}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Load...' : 'Create Load'}
          </button>
        </div>
      </form>
    </div>
  );
}
