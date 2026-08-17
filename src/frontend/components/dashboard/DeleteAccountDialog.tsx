'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/frontend/components/ui/alert-dialog';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';

/**
 * Two-step confirmation: the user must type DELETE before the action is enabled.
 * A single "are you sure?" is too easy to click through by reflex.
 *
 * This used to show a toast reading "your account is scheduled for deletion, our team
 * will confirm by email within 30 days", sign the user out, and do nothing else. No
 * record was written and no email was sent. It now calls `/api/account/delete`, which
 * performs the erasure with the Admin SDK, and reports whatever actually happened —
 * including a refusal, which the old version could not express because it never asked.
 */
export function DeleteAccountDialog() {
  const router = useRouter();
  const { logout } = useAuth();
  const { toast } = useToast();
  const [confirmation, setConfirmation] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [refusal, setRefusal] = React.useState<{ message: string; events?: string[] } | null>(null);

  const handleDelete = async (event: React.MouseEvent) => {
    // The dialog would otherwise close on click, taking the refusal message with it.
    event.preventDefault();
    setDeleting(true);
    setRefusal(null);

    try {
      const response = await authedFetch('/api/account/delete', { method: 'POST' });
      const body = await response.json();

      if (!response.ok) {
        setRefusal({
          message: body.error ?? 'Your account could not be deleted.',
          events: body.blockingEvents,
        });
        return;
      }

      toast({
        title: 'Your account has been deleted',
        description:
          body.ticketsAnonymised > 0
            ? `Your details were removed from ${body.ticketsAnonymised} ticket${
                body.ticketsAnonymised === 1 ? '' : 's'
              }, which are kept as anonymous financial records. A confirmation has been emailed to you.`
            : 'A confirmation has been emailed to you.',
      });
      await logout();
      router.push('/');
    } catch (error) {
      setRefusal({
        message:
          error instanceof Error ? error.message : 'Could not reach the server. Nothing was deleted.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" /> Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. Your profile and sign-in are removed immediately. Tickets
            you bought are kept as anonymous records with your name and email stripped out —
            the purchase is a financial record we are required to retain, but nothing in it
            will point back to you.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {refusal && (
          <div className="rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm">
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {refusal.message}
            </p>
            {refusal.events && refusal.events.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {refusal.events.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="delete-confirmation">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setConfirmation('');
              setRefusal(null);
            }}
            disabled={deleting}
          >
            Keep my account
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmation !== 'DELETE' || deleting}
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
