import type { Metadata } from 'next';

import { OrganiserRegistrationForm } from '@/components/auth/OrganiserRegistrationForm';

export const metadata: Metadata = {
  title: 'Organiser sign-up',
  description: 'Apply to publish and sell events on TicketRoyality.',
};

export default function OrganiserRegisterPage() {
  return (
    <div className="container max-w-2xl py-12">
      <OrganiserRegistrationForm />
    </div>
  );
}
