import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Building, MapPin, Phone, CreditCard, FileText, Save, ArrowLeft } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from './context';
import { useProfile } from '../components/useProfile';
import { dispatchAction } from '../lib/dispatch';

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const empty = {
  username: '',
  email: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  image: '',
  companyName: '',
  companyRegistrationNumber: '',
  vatNumber: '',
  street: '',
  town: '',
  city: '',
  postcode: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  drivingLicenseNumber: '',
  quantityOfVehicles: '',
  invoiced: false,
  instantPayment: false,
};
type Form = typeof empty;

// Ported from the mbh-2 prototype (client/src/pages/EditProfile.tsx): the full
// profile form. Wired to mbh-3's updateProfile dispatch.
export default function EditProfile() {
  const app = useApp();
  const navigate = useNavigate();
  const actorId = app.auth.session?.actorId ?? null;
  const { loading, profile, reload } = useProfile(actorId);

  const [f, setF] = useState<Form>(empty);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (loading || seeded) return;
    setSeeded(true);
    if (profile) {
      setF({
        username: profile.username ?? '',
        email: profile.email || app.auth.session?.email || '',
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        dateOfBirth: profile.dateOfBirth ?? '',
        image: profile.image ?? '',
        companyName: profile.companyName ?? '',
        companyRegistrationNumber: profile.companyRegistrationNumber ?? '',
        vatNumber: profile.vatNumber ?? '',
        street: profile.companyAddress?.street ?? '',
        town: profile.companyAddress?.town ?? '',
        city: profile.companyAddress?.city ?? '',
        postcode: profile.companyAddress?.postcode ?? '',
        contactName: profile.companyContact?.name ?? '',
        contactEmail: profile.companyContact?.email ?? '',
        contactPhone: profile.companyContact?.phone ?? '',
        drivingLicenseNumber: profile.drivingLicenseNumber ?? '',
        quantityOfVehicles: profile.quantityOfVehicles ? String(profile.quantityOfVehicles) : '',
        invoiced: profile.paymentType?.invoiced ?? false,
        instantPayment: profile.paymentType?.instantPayment ?? false,
      });
    } else {
      setF((prev) => ({ ...prev, email: app.auth.session?.email ?? '' }));
    }
  }, [loading, seeded, profile, app.auth.session]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const toggle = (k: keyof Form) => (e: { target: { checked: boolean } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.checked }));

  function field(name: keyof Form, label: string, type = 'text', required = false, placeholder = '') {
    return (
      <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && '*'}
        </label>
        <input
          id={name}
          type={type}
          value={f[name] as string}
          onChange={set(name)}
          required={required}
          placeholder={placeholder}
          className={INPUT}
        />
      </div>
    );
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'updateProfile',
        {
          username: f.username,
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          dateOfBirth: f.dateOfBirth,
          companyName: f.companyName,
          companyRegistrationNumber: f.companyRegistrationNumber,
          companyAddress: { street: f.street, town: f.town, city: f.city, postcode: f.postcode },
          companyContact: { name: f.contactName, email: f.contactEmail, phone: f.contactPhone },
          vatNumber: f.vatNumber,
          drivingLicenseNumber: f.drivingLicenseNumber,
          quantityOfVehicles: parseInt(f.quantityOfVehicles, 10) || 0,
          paymentType: { invoiced: f.invoiced, instantPayment: f.instantPayment },
          image: f.image,
        },
        genRequestId()
      );
      if (res.ok) {
        setSuccess('Profile saved successfully!');
        reload();
        setTimeout(() => navigate('/profile'), 1200);
      } else {
        setError(res.error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Profile
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Profile</h1>
        <p className="text-gray-600">Update your personal and company information</p>
      </div>

      {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>}

      <form onSubmit={submit} className="space-y-6">
        <FormSection icon={<User className="w-5 h-5 text-blue-600" />} title="Personal Information">
          {field('username', 'Username', 'text', true)}
          {field('email', 'Email', 'email', true)}
          {field('firstName', 'First Name', 'text', true)}
          {field('lastName', 'Last Name', 'text', true)}
          {field('dateOfBirth', 'Date of Birth', 'date')}
          {field('image', 'Profile Image URL', 'url', false, 'https://example.com/photo.jpg')}
        </FormSection>

        <FormSection icon={<Building className="w-5 h-5 text-blue-600" />} title="Company Information">
          <div className="md:col-span-2">{field('companyName', 'Company Name', 'text', true)}</div>
          {field('companyRegistrationNumber', 'Company Registration Number')}
          {field('vatNumber', 'VAT Number', 'text', false, 'GB123456789')}
        </FormSection>

        <FormSection icon={<MapPin className="w-5 h-5 text-blue-600" />} title="Company Address">
          <div className="md:col-span-2">{field('street', 'Street', 'text', true)}</div>
          {field('town', 'Town')}
          {field('city', 'City', 'text', true)}
          {field('postcode', 'Postcode', 'text', true)}
        </FormSection>

        <FormSection icon={<Phone className="w-5 h-5 text-blue-600" />} title="Company Contact">
          {field('contactName', 'Contact Name', 'text', true)}
          {field('contactEmail', 'Contact Email', 'email', true)}
          {field('contactPhone', 'Contact Phone', 'tel')}
        </FormSection>

        <FormSection icon={<FileText className="w-5 h-5 text-blue-600" />} title="Driver Information">
          {field('drivingLicenseNumber', 'Driving License Number')}
          {field('quantityOfVehicles', 'Number of Vehicles', 'number')}
        </FormSection>

        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Payment Preferences</h2>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.invoiced} onChange={toggle('invoiced')} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Accept invoiced payments</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.instantPayment} onChange={toggle('instantPayment')} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Accept instant payments</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Profile
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
