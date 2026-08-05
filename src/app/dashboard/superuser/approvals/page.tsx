'use client';

import * as React from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { useToast } from '@/hooks/use-toast';
import { getOrganisers, updateUserProfile } from '@/server/database';
import type { UserProfile } from '@/shared/types';

function Approvals() {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    getOrganisers('pending')
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  const decide = async (uid: string, decision: 'approved' | 'suspended') => {
    setWorking(uid);
    try {
      await updateUserProfile(uid, { status: decision });
      setPending((current) => current.filter((p) => p.uid !== uid));
      toast({
        title: decision === 'approved' ? 'Organiser approved' : 'Application denied',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update the application',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Organiser approvals</h1>
        <p className="text-sm text-muted-foreground">
          Applications waiting for a decision. Approved organisers can publish and sell immediately.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <BadgeCheck className="h-8 w-8 text-success" />
            <p className="text-sm text-muted-foreground">
              Nothing waiting. Every application has been processed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organiser</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((organiser) => (
                  <TableRow key={organiser.uid}>
                    <TableCell>
                      <p className="font-medium">{organiser.fullName}</p>
                      <p className="text-xs text-muted-foreground">{organiser.email}</p>
                    </TableCell>
                    <TableCell>{organiser.companyName ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(organiser.createdAt).toDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{organiser.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={working === organiser.uid}
                          onClick={() => void decide(organiser.uid, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working === organiser.uid}
                          onClick={() => void decide(organiser.uid, 'suspended')}
                        >
                          Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return <RequireRole role="superuser">{() => <Approvals />}</RequireRole>;
}
