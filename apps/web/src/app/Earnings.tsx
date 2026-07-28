import { PoundSterling, TrendingUp, Calendar } from 'lucide-react';
import { formatGbp } from '@mbh/domain';
import { useApp } from './context';
import { useEarnings } from '../components/useEarnings';

// Ported from the mbh-2 prototype (client/src/pages/Earnings.tsx): earnings
// cards + Performance Overview + Recent Trips. Wired to mbh-3's real
// delivered-job history (useEarnings); performance stats are derived from it.
function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Earnings() {
  const app = useApp();
  const actorId = app.auth.session?.actorId ?? null;
  const { loading, jobs } = useEarnings(actorId);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 6) % 7)); // Monday
  const startMonth = new Date(startToday);
  startMonth.setDate(1);

  const sumSince = (since: number): number =>
    jobs.reduce((total, j) => {
      const at = Date.parse(j.deliveredAt);
      return !Number.isNaN(at) && at >= since ? total + j.priceGbpPence : total;
    }, 0);

  const today = sumSince(startToday.getTime());
  const week = sumSince(startWeek.getTime());
  const month = sumSince(startMonth.getTime());
  const allTime = jobs.reduce((total, j) => total + j.priceGbpPence, 0);
  const totalTrips = jobs.length;
  const totalKm = Math.round(jobs.reduce((total, j) => total + (j.distanceMeters ?? 0), 0) / 1000);
  const avgPerTrip = totalTrips > 0 ? Math.round(allTime / totalTrips) : 0;

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600">Loading earnings data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Earnings &amp; Performance</h1>
        <p className="text-gray-600">Track your income and performance metrics</p>
      </div>

      <div className="space-y-6">
        {/* Earnings Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-green-100 p-2 rounded-lg">
                <PoundSterling className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-gray-600 text-sm">Today</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{formatGbp(today)}</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-gray-600 text-sm">This Week</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{formatGbp(week)}</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-purple-100 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-gray-600 text-sm">This Month</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{formatGbp(month)}</div>
          </div>
        </div>

        {/* Performance Stats */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4 text-lg">Performance Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600 mb-1">{totalTrips.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Trips</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600 mb-1">{totalKm.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total km</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600 mb-1">{formatGbp(avgPerTrip)}</div>
              <div className="text-sm text-gray-600">Avg / Trip</div>
            </div>
          </div>
        </div>

        {/* Recent Trips */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Trips</h3>
          <div className="space-y-3">
            {jobs.length > 0 ? (
              jobs.slice(0, 10).map((trip) => (
                <div key={trip.jobId} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-gray-500 w-16">{fmtDate(trip.deliveredAt)}</div>
                    <div className="font-medium text-gray-900">
                      {trip.origin.town} → {trip.destination.town}
                    </div>
                  </div>
                  <div className="font-semibold text-green-600">{formatGbp(trip.priceGbpPence)}</div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">No trips recorded yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
