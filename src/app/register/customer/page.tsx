import type { Metadata } from 'next';

import { CustomerRegistrationForm } from '@/components/auth/CustomerRegistrationForm';

export const metadata: Metadata = {
  title: 'Customer sign-up',
  description: 'Create a TicketRoyality account to buy and manage event tickets.',
};

export default function CustomerRegisterPage() {
  return (
    <div className="container max-w-2xl py-12">
      <CustomerRegistrationForm />
    </div>
  );
}
