'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { authedFetch } from '@/frontend/lib/authed-fetch';

/**
 * Every account on the platform.
 *
 * The overview said "Total users: 1" and gave no way to see who that was. The first
 * question an operator asks about a customer — "do they have an account, and what state
 * is it in?" — had no answer anywhere in the product.
 *
 * Read through an admin-guarded route rather than the client SDK. `firestore.rules`
 * lets any signed-in user list `users`, which is already narrower than it looks — those
 * documents carry email, phone, address and date of birth — and routing the read
 * through `requireAdmin` keeps it behind a verified administrator instead.
 */

interface Account {
  uid: string;
  email: string;
  fullName: string;
  userType: string;
  status: string;
  companyName?: string;
  createdAt: string;
  marketingOptOut: boolean;
}

const ROLE_VARIANT: Record<string, 'gold' | 'success' | 'secondary'> = {
  superuser: 'gold',
  organiser: 'success',
  customer: 'secondary',
};

function AccountsTable() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch(
        `/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load accounts.');
      setAccounts(body.users as Account[]);
      setCounts(body.counts as Record<string, number>);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Debounced so typing a search does not fire a request per keystroke.
    const timer = setTimeout(() => void load(query), 300);
    return () => clearTimeout(timer);
  }, [query, load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Everyone registered on the platform, newest first.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total', value: accounts.length },
          { label: 'Customers', value: counts.customer ?? 0 },
          { label: 'Organisers', value: counts.organiser ?? 0 },
          { label: 'Admins', value: counts.superuser ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 font-headline text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or company"
          className="pl-9"
        />
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {loading && accounts.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {query ? 'No account matches that search.' : 'No accounts yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.uid}>
                    <TableCell className="font-medium">
                      {account.fullName || '—'}
                      {account.companyName && (
                        <span className="block text-xs text-muted-foreground">
                          {account.companyName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {account.email}
                      {account.marketingOptOut && (
                        <span className="block text-xs text-muted-foreground">
                          unsubscribed from marketing
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[account.userType] ?? 'secondary'}>
                        {account.userType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.status || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.createdAt
                        ? new Date(account.createdAt).toLocaleDateString('en-GB')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/*
        Role changes are deliberately not offered here. `userType` is granted by
        `npm run grant:admin`, and `firestore.rules` refuses a self-write to it — a
        button that quietly bypassed both would make the console the weakest link in
        the platform's authorisation model.
      */}
      <p className="text-xs text-muted-foreground">
        Organiser approval is under Organiser approvals. Administrator rights are granted
        from the server with <code>npm run grant:admin</code>, never from this page.
      </p>
    </div>
  );
}

export default function UsersPage() {
  return <RequireRole role="superuser">{() => <AccountsTable />}</RequireRole>;
}
