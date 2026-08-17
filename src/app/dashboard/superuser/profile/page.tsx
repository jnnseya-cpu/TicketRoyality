'use client';

import { Badge } from '@/frontend/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { ProfileForm } from '@/frontend/components/dashboard/ProfileForm';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { useAuth } from '@/frontend/hooks/use-auth';

/**
 * The administrator's own profile.
 *
 * The superuser dashboard had no such page: an administrator could see every account on
 * the platform and edit none of their own details, including their name and picture.
 *
 * The danger zone states why deletion is refused rather than offering a button that
 * cannot work. `/api/account/delete` rejects a superuser server-side — `grant:admin`
 * runs from a machine with service-account credentials, so the last administrator
 * deleting themselves would leave no door back into the platform from inside it — and a
 * control that always returns an error is worse than an explanation. Customers and
 * organisers keep the real button on their own dashboards.
 */
export default function SuperuserProfilePage() {
  const { refreshProfile } = useAuth();

  return (
    <RequireRole role="superuser">
      {(profile) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-headline text-2xl font-bold">My profile</h1>
            <p className="text-sm text-muted-foreground">
              Your administrator account details, photo and cover image.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Your picture appears wherever you act as a person on the platform rather
                than as the platform itself.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm profile={profile} onSaved={() => void refreshProfile()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access</CardTitle>
              <CardDescription>
                Administrator rights are granted from the server and cannot be changed here
                — <code>firestore.rules</code> refuses a self-write to <code>userType</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Badge variant="gold">Superuser</Badge>
              <Badge variant="secondary">{profile.email}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deleting this account</CardTitle>
              <CardDescription>
                Customers and organisers can delete their own account from their dashboard,
                and it is a real erasure — the sign-in and profile go, and tickets are kept
                as anonymous financial records.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                An administrator account cannot be deleted from here, and the server refuses
                it rather than the button being hidden. Administrator rights are granted from
                a machine with service-account credentials, so the last administrator
                deleting themselves would leave nobody able to get back in. Remove the
                superuser role from the server first, and the account can then be deleted
                like any other.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </RequireRole>
  );
}
