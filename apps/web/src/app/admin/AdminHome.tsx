import { Link } from 'react-router-dom';
import { Package, Ticket, Truck, Wrench } from 'lucide-react';

// What is in here, and what is not yet. Stating the gaps beats a dashboard of
// empty cards that implies the data is loading rather than absent.
const cards = [
  {
    to: '/admin/invites',
    icon: Ticket,
    title: 'Invitations',
    body: 'Mint a one-use link, see what is outstanding, and withdraw one that was sent in error.',
  },
  {
    to: '/admin/tools',
    icon: Wrench,
    title: 'Tools',
    body: 'Send yourself a test invoice to prove the SMTP pipeline end to end, letterhead and all.',
  },
];

const previews = [
  { to: '/signup/carrier', icon: Truck, label: 'Carrier sign-up' },
  { to: '/signup/shipper', icon: Package, label: 'Shipper sign-up' },
];

export function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        <p className="text-gray-600 mt-1">
          Founder-only. Everything here is checked again on the server, not just hidden from the menu.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 hover:border-indigo-200 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{card.title}</h3>
              <p className="text-gray-600 text-sm">{card.body}</p>
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Sign-up pages</h3>
        <p className="text-gray-600 text-sm mb-4">
          The two doors from the homepage, to check what a newcomer sees.
        </p>
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

      {/* Said plainly rather than left as an empty dashboard panel that looks
          like it is still loading. */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Not here yet</h3>
        <p className="text-gray-600 text-sm">
          Oversight of every company, load and job across the platform is the next slice, and acting on
          what you find after that. Today this is the founder tools in one place rather than a bar on
          every screen.
        </p>
      </div>
    </div>
  );
}
