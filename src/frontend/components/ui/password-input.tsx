'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/frontend/components/ui/input';
import { cn } from '@/shared/utils';

/**
 * A password field with a reveal toggle.
 *
 * One component for every password input on the platform. Three separate
 * hand-rolled toggles would drift — one would forget `type="button"` and submit the
 * form, another would miss the accessible label — and this is the field people
 * abandon a signup over.
 *
 * Why a reveal toggle at all: forcing a hidden field increases typos, which increases
 * failed logins and password resets. It also actively works against password managers
 * and long passphrases. Showing the character count of a mistake is a smaller risk
 * than the resets it prevents.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof Input>
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        // Room for the button, so a long password never runs underneath it.
        className={cn('pr-10', className)}
      />
      <button
        // Never `submit`: inside a <form> a bare <button> submits it, so revealing the
        // password would post the form instead.
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Excluded from the tab order deliberately. Tabbing from password should reach
        // the submit button, not a decoration between them.
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
