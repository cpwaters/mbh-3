import { Package, Truck } from 'lucide-react';
import { useApp } from './context';

// A strip under the header saying which side of the marketplace the signed-in
// user is working as, and for which company: shippers in the back office's
// indigo, carriers in the app's blue. It follows the app being shown, so a
// company that both ships and carries (which gets the carrier app) reads as
// a carrier. Nothing shows until a company is selected.
export function RoleBanner({ shipper }: { shipper: boolean }) {
  const app = useApp();
  if (app.selected === null) return null;
  const Icon = shipper ? Package : Truck;
  return (
    <div
      role="note"
      aria-label={shipper ? 'Signed in as a shipper' : 'Signed in as a carrier'}
      className={shipper ? 'bg-indigo-950 text-white' : 'bg-blue-600 text-white'}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2 flex items-center gap-2 text-sm">
        <Icon className={`w-4 h-4 shrink-0 ${shipper ? 'text-indigo-300' : 'text-blue-100'}`} aria-hidden="true" />
        <span className="font-semibold">{shipper ? 'Shipper' : 'Carrier'}</span>
        <span className={`truncate ${shipper ? 'text-indigo-200' : 'text-blue-100'}`}>· {app.selected.name}</span>
      </div>
    </div>
  );
}
