import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Truck, Map as MapIcon, Clock, PoundSterling, User, LogOut } from 'lucide-react';
import { TenantSwitcher } from '../components/TenantSwitcher';
import { useApp } from './context';

const NAV = [
  { to: '/', label: 'Dashboard', mobile: 'Home', Icon: LayoutDashboard, end: true },
  { to: '/active', label: 'Active Jobs', mobile: 'Jobs', Icon: Truck, end: false },
  { to: '/map', label: 'Map', mobile: 'Map', Icon: MapIcon, end: false },
  { to: '/driving', label: 'Driving', mobile: 'Time', Icon: Clock, end: false },
  { to: '/earnings', label: 'Earnings', mobile: 'Earn', Icon: PoundSterling, end: false },
  { to: '/profile', label: 'Profile', mobile: 'Profile', Icon: User, end: false },
];

// Ported from the prototype: desktop top-bar pills, mobile fixed bottom tab bar.
export function Navigation() {
  const app = useApp();
  return (
    <>
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Truck className="w-7 h-7 lg:w-8 lg:h-8 text-blue-600" />
              <span className="text-lg lg:text-xl font-bold text-gray-900">MyBackHaul</span>
            </div>

            <div className="hidden lg:flex items-center gap-1">
              {NAV.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {app.selected !== null && (
                <TenantSwitcher
                  tenants={app.tenants}
                  selected={app.selected}
                  onSelect={app.selectTenant}
                />
              )}
              <button
                type="button"
                onClick={() => void app.auth.signOut()}
                title="Sign out"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden lg:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-[1100] bg-white border-t border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-6">
          {NAV.map(({ to, mobile, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
                  isActive ? 'text-blue-600' : 'text-gray-500'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{mobile}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}
