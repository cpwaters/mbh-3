import { useNavigate } from 'react-router-dom';
import { User, Star, Truck, MapPin, Phone, Building, FileText, Calendar } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { VEHICLE_TYPE_LABELS, VEHICLE_CONFIGURATION_LABELS, type VehicleType, type VehicleConfiguration } from '@mbh/domain';
import { useApp } from './context';
import { useProfile } from '../components/useProfile';
import { useVehicles } from '../components/useVehicles';
import { dispatchAction } from '../lib/dispatch';

// Ported from the mbh-2 prototype (client/src/pages/Profile.tsx): the profile
// card + personal/company/address/contact/driver sections + the vehicle list.
// Wired to mbh-3's userProfiles + the selected carrier tenant's fleet.
export default function Profile() {
  const app = useApp();
  const navigate = useNavigate();
  const actorId = app.auth.session?.actorId ?? null;
  const carrierTenantId = app.isCarrier && app.selected !== null ? app.selected.tenantId : null;
  const { loading, profile } = useProfile(actorId);
  const { vehicles, reload: reloadVehicles } = useVehicles(carrierTenantId);

  async function retire(vehicleId: string): Promise<void> {
    if (carrierTenantId === null) return;
    const res = await dispatchAction(app.auth.getIdToken, 'retireVehicle', { carrierTenantId, vehicleId }, genRequestId());
    if (res.ok) reloadVehicles();
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600">Loading profile...</div>
        </div>
      </div>
    );
  }

  const fullName =
    profile && (profile.firstName || profile.lastName)
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : (app.auth.session?.displayName ?? 'Driver');
  const email = profile?.email || app.auth.session?.email || '';
  const rating = profile?.rating ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
        <p className="text-gray-600">Manage your personal and company information</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex flex-col items-center">
              {profile?.image ? (
                <img
                  src={profile.image}
                  alt="Profile"
                  className="w-24 h-24 rounded-full mb-4 object-cover border-4 border-blue-100"
                />
              ) : (
                <div className="bg-blue-100 p-6 rounded-full mb-4">
                  <User className="w-12 h-12 text-blue-600" />
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{fullName}</h2>
              <p className="text-gray-600 mb-4">{profile?.companyName || 'Professional Driver'}</p>

              <div className="flex items-center gap-1 mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-2 font-semibold text-gray-900">{rating.toFixed(1)}</span>
              </div>

              <div className="w-full space-y-3">
                <div className="flex justify-between items-start gap-3 py-2 border-b">
                  <span className="text-gray-600 flex-shrink-0">Email</span>
                  <span className="font-semibold text-gray-900 text-sm text-right break-all">{email || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-start gap-3 py-2 border-b">
                  <span className="text-gray-600 flex-shrink-0">Username</span>
                  <span className="font-semibold text-gray-900 text-right break-all">@{profile?.username || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-start gap-3 py-2 border-b">
                  <span className="text-gray-600 flex-shrink-0">Vehicles</span>
                  <span className="font-semibold text-gray-900">{vehicles.length}</span>
                </div>
                <div className="flex justify-between items-start gap-3 py-2">
                  <span className="text-gray-600 flex-shrink-0">Member Since</span>
                  <span className="font-semibold text-gray-900">{new Date().getFullYear()}</span>
                </div>
              </div>

              <div className="w-full mt-6 space-y-2">
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Edit Profile
                </button>
                {carrierTenantId !== null && (
                  <button
                    onClick={() => navigate('/vehicles/add')}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Truck className="w-4 h-4" />
                    Add Vehicle
                  </button>
                )}
                <button
                  onClick={() => void app.auth.signOut()}
                  className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="lg:col-span-2 space-y-6">
          <Section icon={<User className="w-5 h-5 text-blue-600" />} title="Personal Information">
            <Field label="First Name" value={profile?.firstName} />
            <Field label="Last Name" value={profile?.lastName} />
            <Field label="Email" value={email} />
            <Field label="Date of Birth" value={profile?.dateOfBirth} />
          </Section>

          <Section icon={<Building className="w-5 h-5 text-blue-600" />} title="Company Information">
            <Field label="Company Name" value={profile?.companyName} />
            <Field label="Registration Number" value={profile?.companyRegistrationNumber} />
            <Field label="VAT Number" value={profile?.vatNumber} />
            <Field label="Number of Vehicles" value={String(profile?.quantityOfVehicles ?? 0)} />
          </Section>

          <Section icon={<MapPin className="w-5 h-5 text-blue-600" />} title="Company Address">
            <div className="md:col-span-2">
              <FieldInner label="Street" value={profile?.companyAddress?.street} />
            </div>
            <FieldInner label="Town" value={profile?.companyAddress?.town} />
            <FieldInner label="City" value={profile?.companyAddress?.city} />
            <FieldInner label="Postcode" value={profile?.companyAddress?.postcode} />
          </Section>

          <Section icon={<Phone className="w-5 h-5 text-blue-600" />} title="Company Contact">
            <Field label="Contact Name" value={profile?.companyContact?.name} />
            <Field label="Contact Email" value={profile?.companyContact?.email} />
            <Field label="Contact Phone" value={profile?.companyContact?.phone} />
          </Section>

          <Section icon={<FileText className="w-5 h-5 text-blue-600" />} title="Driver Information">
            <Field label="Driving License Number" value={profile?.drivingLicenseNumber} />
            <div>
              <label className="text-sm text-gray-600">Rating</label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>
                <span className="font-medium text-gray-900">{rating.toFixed(1)}</span>
              </div>
            </div>
          </Section>

          {/* Vehicles */}
          {carrierTenantId !== null && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  My Vehicles ({vehicles.length})
                </h3>
                <button
                  onClick={() => navigate('/vehicles/add')}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  + Add Vehicle
                </button>
              </div>

              {vehicles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehicles.map((vehicle) => (
                    <div key={vehicle.vehicleId} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Truck className="w-5 h-5 text-blue-600" />
                          <h4 className="font-semibold text-gray-900">
                            {vehicle.make} {vehicle.model}
                          </h4>
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {VEHICLE_TYPE_LABELS[vehicle.vehicleType as VehicleType]}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Registration:</span>
                          <span className="font-medium text-gray-900">{vehicle.registration}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Year:</span>
                          <span className="font-medium text-gray-900 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {vehicle.year}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Configuration:</span>
                          <span className="font-medium text-gray-900">
                            {VEHICLE_CONFIGURATION_LABELS[vehicle.vehicleConfiguration as VehicleConfiguration]}
                          </span>
                        </div>
                        {vehicle.vin && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">VIN:</span>
                            <span className="font-medium text-gray-900 text-xs">{vehicle.vin}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => void retire(vehicle.vehicleId)}
                        className="mt-3 text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No vehicles added yet</p>
                  <button
                    onClick={() => navigate('/vehicles/add')}
                    className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Add your first vehicle
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <FieldInner label={label} value={value} />
    </div>
  );
}

function FieldInner({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <label className="text-sm text-gray-600">{label}</label>
      <p className="font-medium text-gray-900">{value || 'Not provided'}</p>
    </>
  );
}
