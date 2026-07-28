import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Truck, LogOut, User } from 'lucide-react';
import { TenantSwitcher } from '../../components/TenantSwitcher';
import { useApp } from '../context';

// Ported from the mbh-2 distributor prototype (distributor/src/components/
// Navigation.tsx): desktop top-bar + mobile bottom tab bar. Wired to mbh-3's
// app context (sign-out + the tenant switcher for multi-tenant users).
const navItems = [
  { path: '/', label: 'All Loads', mobileLabel: 'Loads', icon: LayoutDashboard },
  { path: '/create', label: 'Create Load', mobileLabel: 'Create', icon: PlusCircle },
];

export default function DistributorNavigation() {
  const app = useApp();
  const showSwitcher = app.selected !== null && app.tenants.length > 1;

  return (
    <>
      <nav className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Truck className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">MyBackHaul</h1>
            </div>

            <div className="flex items-center gap-1">
              <div className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border-l border-gray-200 ml-2 ${
                      isActive ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <div className="bg-gray-200 p-1.5 rounded-full">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                  <span className="font-medium">Profile</span>
                </NavLink>
              </div>
              {showSwitcher && app.selected !== null && (
                <div className="ml-1 lg:ml-2">
                  <TenantSwitcher tenants={app.tenants} selected={app.selected} onSelect={app.selectTenant} />
                </div>
              )}
              <button
                onClick={() => void app.auth.signOut()}
                className="flex items-center gap-2 px-2 lg:px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ml-1 lg:ml-0"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden lg:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar (below lg:). */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-[1100] bg-white border-t border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.mobileLabel}</span>
              </NavLink>
            );
          })}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? 'text-purple-600' : 'text-gray-500'
              }`
            }
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </NavLink>
        </div>
      </div>
    </>
  );
}
