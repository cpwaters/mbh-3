import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Truck, User, Clock, LogOut, TrendingUp } from 'lucide-react';
import { TenantSwitcher } from '../components/TenantSwitcher';
import { useApp } from './context';

// Ported from the mbh-2 prototype (client/src/components/Navigation.tsx):
// desktop top-bar pills + Logout; mobile bottom tab bar. Wired to mbh-3's app
// context (sign-out + the tenant switcher, shown only for multi-tenant users
// so the single-tenant look stays exactly like the prototype).
const navItems = [
  { path: '/', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { path: '/active', label: 'Active Jobs', mobileLabel: 'Jobs', icon: Truck },
  { path: '/map', label: 'Map', mobileLabel: 'Map', icon: Map },
  { path: '/driving', label: 'Driving Time', mobileLabel: 'Time', icon: Clock },
  { path: '/earnings', label: 'Earnings', mobileLabel: 'Earn', icon: TrendingUp },
  { path: '/profile', label: 'Profile', mobileLabel: 'Profile', icon: User },
];

export function Navigation() {
  const app = useApp();
  const showSwitcher = app.selected !== null && app.tenants.length > 1;

  return (
    <>
      <nav className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <img src="/android-chrome-384x384.png" alt="MyBackHaul logo" className="w-8 h-8" />
              {/* Drop the wordmark on phones when the switcher is present so the
                  logo + switcher + logout fit a 320px bar; single-tenant users
                  (no switcher) keep it at every width. */}
              <h1 className={`text-xl lg:text-2xl font-bold text-gray-900${showSwitcher ? ' hidden sm:block' : ''}`}>MyBackHaul</h1>
            </div>

            {/* Right cluster: desktop nav pills (lg only) + one switcher + one
                logout (icon on mobile, icon+text on desktop). min-w-0 so the
                switcher shrinks instead of overflowing the bar. */}
            <div className="flex items-center gap-1 min-w-0">
              <div className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
              {showSwitcher && app.selected !== null && (
                <div className="ml-1 lg:ml-2">
                  <TenantSwitcher tenants={app.tenants} selected={app.selected} onSelect={app.selectTenant} />
                </div>
              )}
              <button
                onClick={() => void app.auth.signOut()}
                className="flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ml-1 lg:ml-2"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden lg:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom tab bar, shown below lg:. z-index clears Leaflet's panes. */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-[1100] bg-white border-t border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium whitespace-nowrap ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.mobileLabel}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </>
  );
}
