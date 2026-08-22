'use client';

import * as React from 'react';
import { Check, Share2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { useToast } from '@/frontend/hooks/use-toast';
import { track } from '@/frontend/lib/analytics';

/**
 * One share button for any link the organiser hands to somebody else — a private
 * event's URL, the gate staff's check-in portal.
 *
 * The native share sheet where the device has one (phones — WhatsApp, SMS, email in
 * one tap), the clipboard where it does not (desktops), and the copied state shown
 * either way. `path` is app-relative so the link always carries whatever origin the
 * page is actually being served from.
 */
export function ShareLink({
  path,
  label,
  title,
  variant = 'outline',
  size = 'sm',
}: {
  path: string;
  label: string;
  /** The share sheet's heading — "Check-in portal — Royal Night Live". */
  title?: string;
  variant?: 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'default';
}) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    track('share', { name: title ?? label, method: 'link' });

    if (navigator.share) {
      try {
        await navigator.share({ title: title ?? label, url });
        return;
      } catch {
        // Cancelled the sheet, or the platform refused — the clipboard still works.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Link copied', description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy this link', description: url });
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void share()}>
      {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}
