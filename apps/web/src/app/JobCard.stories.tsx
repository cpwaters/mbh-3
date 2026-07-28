import type { Meta, StoryObj } from '@storybook/react';
import {
  JobCard,
  JobCardRoute,
  JobCardPayment,
  JobCardSection,
  JobCardActions,
  JobCardStatusBadge,
} from './JobCard';

const meta: Meta = {
  title: 'Components/JobCard',
};
export default meta;

export const AvailableLoad: StoryObj = {
  render: () => (
    <div className="p-6 max-w-2xl bg-gray-50">
      <JobCard>
        <JobCardRoute
          badge={<JobCardStatusBadge status="available" />}
          origin="Avonmouth, BS11 8DL"
          destination="Cardiff, CF10 4UW"
        />
        <JobCardPayment amount="£420.00" />
        <JobCardActions>
          <button className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium">Accept Load</button>
          <button className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700">
            View Details
          </button>
        </JobCardActions>
      </JobCard>
    </div>
  ),
};

export const InTransitWithProgress: StoryObj = {
  render: () => (
    <div className="p-6 max-w-2xl bg-gray-50">
      <JobCard>
        <JobCardRoute
          badge={<JobCardStatusBadge status="in_transit" />}
          origin="Trafford, M17 1WS"
          destination="Leith, EH6 6JJ"
        />
        <JobCardPayment amount="£680.00" />
        <JobCardSection>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium text-gray-900">In Transit</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: '85%' }} />
          </div>
        </JobCardSection>
      </JobCard>
    </div>
  ),
};

export const StatusBadges: StoryObj = {
  render: () => (
    <div className="p-6 flex flex-wrap gap-3 bg-gray-50">
      {['available', 'accepted', 'collected', 'in_transit', 'delivered', 'closed', 'cancelled'].map((s) => (
        <JobCardStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};
