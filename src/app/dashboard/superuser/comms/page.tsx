import type { Metadata } from 'next';

import { CommsConsole } from '@/frontend/components/dashboard/CommsConsole';

export const metadata: Metadata = {
  title: 'Communication architecture',
  description: 'Every catalogue event, its channels, severity and opt-out status.',
};

export default function CommsPage() {
  return <CommsConsole />;
}
