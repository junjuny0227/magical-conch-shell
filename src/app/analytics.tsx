'use client';

import { Analytics } from '@vercel/analytics/next';

import { sanitizeAnalyticsEvent } from './lib/analytics';

const AppAnalytics = () => {
  return <Analytics beforeSend={sanitizeAnalyticsEvent} debug={false} />;
};

export default AppAnalytics;
