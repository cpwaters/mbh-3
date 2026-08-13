import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapPin, Box, Building, Truck, CreditCard, PoundSterling, Info } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { dispatchAction } from '../../lib/dispatch';
import LiveLocationMap from '../LiveLocationMap';
import { geocodePostcode, type GeoPoint } from '../../lib/geocode';
import { getDrivingDistanceMiles, getDrivingRoute } from '../../lib/routing';
import { useAddressBook } from '../../components/useAddressBook';
import { AddressBookPicker, entryFromFields, fieldsFromEntry, type AddressSide } from './AddressBookPicker';

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
export type Form = typeof empty;

// Ported from the mbh-2 distributor prototype (distributor/src/pages/
// CreateLoad.tsx). Wired to mbh-3's postLoad — the core (origin/destination/
// consignment/price/dates) drives the marketplace; the rest rides along as
// posting details. A price field is added (mbh-3 requires it).
export default function CreateLoad() {
  const app = useApp();
  const location = useLocation();
  const shipperTenantId = app.selected?.tenantId ?? null;
  // "Reuse this load" (LoadsList.tsx) navigates here with the addresses of a
  // fulfilled load pre-filled via router state — weight/pallets/dates are
  // deliberately left blank for the shipper to fill in fresh. Read once at
  // mount (router state is available synchronously, unlike EditProfile's
  // async-fetched prefill, so no seeding effect is needed).
  const [f, setF] = useState<Form>(() => {
    const reuseFrom = (location.state as { reuseFrom?: Partial<Form> } | null)?.reuseFrom;
    return reuseFrom ? { ...empty, ...reuseFrom } : empty;
  });
  const [reused] = useState(() => (location.state as { reuseFrom?: Partial<Form> } | null)?.reuseFrom !== undefined);
  const addressBook = useAddressBook(shipperTenantId);
  const [saveSides, setSaveSides] = useState<Record<AddressSide, boolean>>({ source: false, destination: false });
  // Saving an address is a side-benefit of posting a load: if it fails, the
  // load still posted and the shipper is told, rather than the whole submit
  // reading as a failure.
  const [addressBookNote, setAddressBookNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [originPin, setOriginPin] = useState<GeoPoint | null>(null);
  const [destinationPin, setDestinationPin] = useState<GeoPoint | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<GeoPoint[] | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Live route preview + an auto-estimated mileage, once both postcodes look
  // complete — debounced so it doesn't hit postcodes.io/OSRM on every
  // keystroke. Replaces asking the shipper to type a distance from memory;
  // the map updates as soon as they finish typing either postcode (this is
  // the fix for "the map view was not updated when adding a new load" — there
  // was no map here at all before).
  useEffect(() => {
    const originPc = f.source_postcode.trim();
    const destPc = f.destination_postcode.trim();
    if (originPc.length < 5 || destPc.length < 5) {
      setOriginPin(null);
      setDestinationPin(null);
      setRouteGeometry(null);
      setEstimating(false);
      return;
    }

    let cancelled = false;
    setEstimating(true);
    const timer = window.setTimeout(() => {
      geocodePostcode(originPc).then((o) => {
        if (cancelled) return;
        setOriginPin(o);
        geocodePostcode(destPc).then((d) => {
          if (cancelled) return;
          setDestinationPin(d);
          if (o === null || d === null) {
            setRouteGeometry(null);
            setEstimating(false);
            return;
          }
          Promise.all([getDrivingRoute(o, d), getDrivingDistanceMiles(o, d)]).then(([geometry, miles]) => {
            if (cancelled) return;
            setRouteGeometry(geometry);
            if (miles !== null) {
              setF((prev) => ({ ...prev, distance: String(Math.round(miles)) }));
            }
            setEstimating(false);
          });
        });
      });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [f.source_postcode, f.destination_postcode]);

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

  const pickAddress = (side: AddressSide) => (entry: Parameters<typeof fieldsFromEntry>[1]) => {
    setF((prev) => ({ ...prev, ...fieldsFromEntry(side, entry) }));
    // Clear any "Required" errors the picked fields just satisfied.
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(fieldsFromEntry(side, entry))) delete next[key];
      return next;
    });
  };

  // Only offer to save once there is actually an address worth saving.
  const canSave = (side: AddressSide): boolean =>
    f[`${side}_street`].trim() !== '' && f[`${side}_city`].trim() !== '' && f[`${side}_postcode`].trim() !== '';

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

  // Best-effort, and deliberately AFTER the load posts: the load is the thing
  // the shipper came here to do. A failed save leaves a note rather than
  // turning a successful post into an error.
  async function saveTickedAddresses(tenantId: string): Promise<void> {
    const sides = (['source', 'destination'] as AddressSide[]).filter((side) => saveSides[side]);
    if (sides.length === 0) return;

    const failed: string[] = [];
    for (const side of sides) {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'saveAddressBookEntry',
        { shipperTenantId: tenantId, ...entryFromFields(side, f) },
        genRequestId()
      );
      if (!res.ok) failed.push(side === 'source' ? 'collection' : 'delivery');
    }

    if (failed.length > 0) {
      setAddressBookNote(`The load posted, but the ${failed.join(' and ')} address could not be saved.`);
    } else {
      setAddressBookNote(null);
      addressBook.reload();
    }
  }

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (!validate()) return;
    if (shipperTenantId === null) {
      setErrors({ submit: 'Select a shipper company first.' });
      return;
    }
    setLoading(true);
    setAddressBookNote(null);
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
        await saveTickedAddresses(shipperTenantId);
        setF(empty);
        setSaveSides({ source: false, destination: false });
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

      {reused && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            Addresses carried over from a previous load — update the weight, pallets, and schedule below.
          </p>
        </div>
      )}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
      {addressBookNote && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">{addressBookNote}</p>
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
          <AddressBookPicker
            side="source"
            entries={addressBook.entries}
            onPick={pickAddress('source')}
            save={saveSides.source}
            onSaveChange={(next) => setSaveSides((prev) => ({ ...prev, source: next }))}
            canSave={canSave('source')}
          />
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
          <AddressBookPicker
            side="destination"
            entries={addressBook.entries}
            onPick={pickAddress('destination')}
            save={saveSides.destination}
            onSaveChange={(next) => setSaveSides((prev) => ({ ...prev, destination: next }))}
            canSave={canSave('destination')}
          />
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

        {(originPin !== null || destinationPin !== null || estimating) && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Route preview
            </h2>
            <div className="h-72 rounded-lg overflow-hidden border border-gray-200">
              {originPin !== null || destinationPin !== null ? (
                <LiveLocationMap
                  origin={originPin !== null ? { ...originPin, label: 'Collection' } : undefined}
                  destination={destinationPin !== null ? { ...destinationPin, label: 'Delivery' } : undefined}
                  routeGeometry={routeGeometry ?? undefined}
                />
              ) : (
                <div className="h-full flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
                  Looking up postcodes…
                </div>
              )}
            </div>
          </div>
        )}

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
          <div className="mt-4">
            {text('distance', 'Distance (miles)', false, 'number', '208')}
            <p className="mt-1 text-xs text-gray-500">
              {estimating
                ? 'Estimating driving distance…'
                : f.distance
                  ? 'Estimated automatically from a driving route — adjust if needed.'
                  : 'Fills in automatically once both postcodes are entered.'}
            </p>
          </div>
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
