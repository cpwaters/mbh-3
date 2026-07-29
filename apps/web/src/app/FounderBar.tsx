import { Link } from 'react-router-dom';
import { ShieldCheck, Home, Truck, Package, LayoutDashboard } from 'lucide-react';

// A slim, founder-only toolbar (shown when signed in as the founder account).
// Quick access to the public home page and the carrier/shipper sign-up pages,
// plus a way back into the app. Visually distinct from the product chrome.
export function FounderBar() {
  const link =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium text-indigo-100 hover:bg-white/10 transition-colors whitespace-nowrap';
  return (
    <div className="bg-indigo-950 text-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 h-10 flex items-center gap-1 overflow-x-auto">
        <span className="inline-flex items-center gap-1.5 pr-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
          <ShieldCheck className="w-4 h-4" />
          Founder
        </span>
        {/* Public marketing site — a real navigation out of the app. */}
        <a href="/" className={link}>
          <Home className="w-4 h-4" />
          Home
        </a>
        <Link to="/signup/carrier" className={link}>
          <Truck className="w-4 h-4" />
          Carrier sign-up
        </Link>
        <Link to="/signup/shipper" className={link}>
          <Package className="w-4 h-4" />
          Shipper sign-up
        </Link>
        <Link to="/" className={`${link} ml-auto`}>
          <LayoutDashboard className="w-4 h-4" />
          App
        </Link>
      </div>
    </div>
  );
}
