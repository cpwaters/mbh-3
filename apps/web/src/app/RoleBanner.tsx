import { Package, Repeat, Truck } from 'lucide-react';
import { companyKind } from '@mbh/domain';
import { useApp } from './context';
import { useFeatureFlags } from '../components/useFeatureFlags';

const STYLES = {
  // The back office's indigo.
  shipper: {
    title: 'Shipper',
    label: 'Signed in as a shipper',
    Icon: Package,
    bar: 'bg-indigo-950 text-white',
    icon: 'text-indigo-300',
    muted: 'text-indigo-200',
  },
  // The app's blue.
  carrier: {
    title: 'Carrier',
    label: 'Signed in as a carrier',
    Icon: Truck,
    bar: 'bg-blue-600 text-white',
    icon: 'text-blue-100',
    muted: 'text-blue-100',
  },
  // Both sides: the two colours joined.
  both: {
    title: 'Shipper & Carrier',
    label: 'Signed in as a shipper and carrier',
    Icon: Repeat,
    bar: 'bg-gradient-to-r from-indigo-950 to-blue-600 text-white',
    icon: 'text-indigo-200',
    muted: 'text-indigo-100',
  },
} as const;

// A strip under the header saying which side of the marketplace the signed-in
// user's company is on, and which company: a shipper in the back office's
// indigo, a carrier in the app's blue, and a company that does both on the two
// joined. That last is behind the founder's "Shipper & Carrier accounts"
// switch: off, a company that does both reads as a carrier, the app it gets.
// Nothing shows until a company is selected.
export function RoleBanner() {
  const app = useApp();
  const shipperCarrierOn = useFeatureFlags().flags.shipperCarrier;
  if (app.selected === null) return null;
  const kind = companyKind(app.selected.capabilities);
  const style = STYLES[kind === 'shipper' ? 'shipper' : kind === 'both' && shipperCarrierOn ? 'both' : 'carrier'];
  const { Icon } = style;
  return (
    <div role="note" aria-label={style.label} className={style.bar}>
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2 flex items-center gap-2 text-sm">
        <Icon className={`w-4 h-4 shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="font-semibold">{style.title}</span>
        <span className={`truncate ${style.muted}`}>· {app.selected.name}</span>
      </div>
    </div>
  );
}
