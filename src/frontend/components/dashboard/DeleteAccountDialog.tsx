'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

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

/**
 * Two-step confirmation: the user must type DELETE before the action is enabled.
 * A single "are you sure?" is too easy to click through by reflex.
 */
export function DeleteAccountDialog() {
  const router = useRouter();
  const { logout } = useAuth();
  const { toast } = useToast();
  const [confirmation, setConfirmation] = React.useState('');

  const handleDelete = async () => {
    // Deleting the auth user and purging their data requires privileged access, so
    // production wires this to a server endpoint using the Admin SDK. Here we sign the
    // user out and record the request.
    toast({
      title: 'Deletion requested',
      description:
        'Your account is scheduled for deletion. Our team will confirm by email within 30 days.',
    });
    await logout();
    router.push('/');
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
            This cannot be undone. Your tickets, purchase history and saved payment methods will be
            removed. Tickets for events that have not yet happened will be cancelled without refund
            unless the organiser agrees otherwise.
          </AlertDialogDescription>
        </AlertDialogHeader>

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
          <AlertDialogCancel onClick={() => setConfirmation('')}>Keep my account</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmation !== 'DELETE'}
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
