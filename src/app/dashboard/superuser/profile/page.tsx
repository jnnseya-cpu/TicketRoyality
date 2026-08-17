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
 * No danger zone here on purpose. `DeleteAccountDialog` would let the only administrator
 * delete the only administrator, and there is no second door back in — `grant:admin`
 * runs from a machine with service-account credentials, not from the product.
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
        </div>
      )}
    </RequireRole>
  );
}
