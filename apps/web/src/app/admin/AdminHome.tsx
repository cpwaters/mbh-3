import { Link } from 'react-router-dom';
import { Activity, Building2, Package, Route as RouteIcon, Ticket, Truck, Users, Wrench } from 'lucide-react';
import { formatGbp, isTenantSuspended } from '@mbh/domain';
import { useAdminData, type AdminData } from './adminData';

const LIVE_JOB = ['accepted', 'collected', 'in_transit'];

function startOfMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// The numbers a founder checks first. Each is a count over what was read, not
// a cached figure, so it is never out of step with the lists behind it.
export function marketplaceStats(data: AdminData, now: Date) {
  const monthStart = startOfMonth(now);
  const deliveredThisMonth = data.jobs.filter((j) => (j.deliveredAt ?? '') >= monthStart);
  return {
    companies: data.companies.length,
    suspended: data.companies.filter(isTenantSuspended).length,
    people: new Set(data.members.map((m) => m.actorId)).size,
    onOffer: data.loads.filter((l) => l.status === 'available').length,
    underWay: data.jobs.filter((j) => LIVE_JOB.includes(j.status)).length,
    deliveredThisMonth: deliveredThisMonth.length,
    valueThisMonth: deliveredThisMonth.reduce((sum, j) => sum + j.priceGbpPence, 0),
  };
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {note !== undefined && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
  );
}

const cards = [
  { to: '/admin/companies', icon: Building2, title: 'Companies', body: 'Every shipper and carrier. Suspend or reinstate one.' },
  { to: '/admin/people', icon: Users, title: 'People', body: 'Everyone signed up. Change a role, or disable someone.' },
  { to: '/admin/loads', icon: Package, title: 'Loads', body: 'Everything posted. Withdraw a load still on offer.' },
  { to: '/admin/jobs', icon: RouteIcon, title: 'Jobs', body: 'Every accepted load, from collection to PoD.' },
  { to: '/admin/activity', icon: Activity, title: 'Activity', body: 'Who did what, when — the audit log, newest first.' },
  { to: '/admin/invites', icon: Ticket, title: 'Invitations', body: 'Mint a one-use link, or withdraw one sent in error.' },
  { to: '/admin/tools', icon: Wrench, title: 'Tools', body: 'Send yourself a test invoice to prove the email pipeline.' },
];

const previews = [
  { to: '/signup/carrier', icon: Truck, label: 'Carrier sign-up' },
  { to: '/signup/shipper', icon: Package, label: 'Shipper sign-up' },
];

export function AdminHome() {
  const { state } = useAdminData();
  const stats = state.kind === 'ready' ? marketplaceStats(state.data, new Date()) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        <p className="text-gray-600 mt-1">
          Founder-only. Everything here is checked again on the server, not just hidden from the menu.
        </p>
      </div>

      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Companies"
          value={stats === null ? '…' : String(stats.companies)}
          {...(stats !== null && stats.suspended > 0 ? { note: `${stats.suspended} suspended` } : {})}
        />
        <Stat label="People" value={stats === null ? '…' : String(stats.people)} />
        <Stat
          label="Loads on offer"
          value={stats === null ? '…' : String(stats.onOffer)}
          {...(stats !== null ? { note: `${stats.underWay} jobs under way` } : {})}
        />
        <Stat
          label="Delivered this month"
          value={stats === null ? '…' : String(stats.deliveredThisMonth)}
          {...(stats !== null ? { note: `${formatGbp(stats.valueThisMonth)} moved` } : {})}
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-lg transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">{card.title}</h3>
              <p className="text-gray-600 text-sm">{card.body}</p>
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Sign-up pages</h3>
        <p className="text-gray-600 text-sm mb-4">The two doors from the homepage, to check what a newcomer sees.</p>
        <div className="flex flex-wrap gap-2">
          {previews.map((preview) => {
            const Icon = preview.icon;
            return (
              <Link
                key={preview.to}
                to={preview.to}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                <Icon className="w-4 h-4" />
                {preview.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
