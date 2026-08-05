'use client';

import { Badge } from '@/frontend/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { DeleteAccountDialog } from '@/frontend/components/dashboard/DeleteAccountDialog';
import { ProfileForm } from '@/frontend/components/dashboard/ProfileForm';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useAuth } from '@/frontend/hooks/use-auth';
import { commissionTermsFor } from '@/shared/pricing';
import { formatCurrency } from '@/shared/utils';

export default function OrganiserSettingsPage() {
  const { refreshProfile } = useAuth();

  return (
    <RequireRole role="organiser">
      {(profile) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Your organiser profile, commercial terms and account controls.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Organiser profile</CardTitle>
              <CardDescription>Shown on your public organiser page and on tickets.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm profile={profile} onSaved={() => void refreshProfile()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commercial terms</CardTitle>
              <CardDescription>
                Set by the platform. Contact support to negotiate a bespoke agreement.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Badge variant="gold">Commission {commissionTermsFor(profile).percent}%</Badge>
              <Badge variant="gold">
                Admin fee {formatCurrency(commissionTermsFor(profile).adminFee)} per ticket
              </Badge>
              <Badge variant={profile.status === 'approved' ? 'success' : 'secondary'}>
                Account {profile.status}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting your organiser account cancels unsold inventory on all your events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog />
            </CardContent>
          </Card>
        </div>
      )}
    </RequireRole>
  );
}
