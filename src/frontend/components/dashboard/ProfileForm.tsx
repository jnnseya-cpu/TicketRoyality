'use client';

import * as React from 'react';
import { Loader2, Pencil } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { useToast } from '@/frontend/hooks/use-toast';
import { updateUserProfile } from '@/shared/data/repositories';
import type { UserProfile } from '@/shared/types';

/**
 * Read-only by default so a stray keystroke cannot silently change stored details.
 * "Edit" unlocks the fields; "Save" writes them back to Firestore.
 */
export function ProfileForm({
  profile,
  onSaved,
}: {
  profile: UserProfile;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState({
    fullName: profile.fullName,
    phone: profile.phone ?? '',
    line1: profile.address?.line1 ?? '',
    city: profile.address?.city ?? '',
    postcode: profile.address?.postcode ?? '',
    country: profile.address?.country ?? '',
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateUserProfile(profile.uid, {
        fullName: values.fullName,
        phone: values.phone,
        address: {
          line1: values.line1,
          city: values.city,
          postcode: values.postcode,
          country: values.country,
        },
      });
      toast({ title: 'Profile updated' });
      setEditing(false);
      onSaved?.();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<[keyof typeof values, string]> = [
    ['fullName', 'Full name'],
    ['phone', 'Phone'],
    ['line1', 'Address'],
    ['city', 'City'],
    ['postcode', 'Postcode'],
    ['country', 'Country'],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
        </div>
        {fields.map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`profile-${key}`}>{label}</Label>
            <Input
              id={`profile-${key}`}
              value={values[key]}
              disabled={!editing}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" /> Edit profile
        </Button>
      )}
    </div>
  );
}
