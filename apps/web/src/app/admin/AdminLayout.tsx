import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, LogOut, ShieldCheck, Ticket, Wrench } from 'lucide-react';
import { useApp } from '../context';
import { isFounder } from '../../lib/founder';

// The founder's back office. A separate place rather than a strip across the
// top of the product: the tools here are not part of running a haulage job,
// and a permanent bar made every screen look like an admin console.
//
// This gate is convenience, NOT the security boundary. Every action behind it
// is checked server-side on the verified token's email (requireFounder), and
// the reads are gated by Firestore rules. Hiding the UI stops an accidental
// visit; it is not what stops a determined one — same split as lib/founder.ts.
const tabs = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/invites', label: 'Invitations', icon: Ticket, end: false },
  { to: '/admin/tools', label: 'Tools', icon: Wrench, end: false },
];

export function AdminLayout() {
  const app = useApp();

  // Anyone else is sent back to their own app rather than shown a locked
  // door — there is nothing here for them and saying so would only advertise
  // that the door exists.
  if (!isFounder(app.auth.session)) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-6 h-6 text-indigo-300 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">MyBackHaul admin</h1>
                <p className="text-xs text-indigo-300 truncate">{app.auth.session?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NavLink
                to="/"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-100 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to the app</span>
              </NavLink>
              {/* The back office has its own chrome, so it needs its own way
                  out: without this the only sign-out is back through the
                  product nav, which is a strange thing to require of an
                  admin area. */}
              <button
                type="button"
                onClick={() => void app.auth.signOut()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-100 hover:bg-white/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-white text-white'
                        : 'border-transparent text-indigo-300 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
