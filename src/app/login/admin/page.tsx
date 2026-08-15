'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/frontend/components/ui/form';
import { Input } from '@/frontend/components/ui/input';
import { PasswordInput } from '@/frontend/components/ui/password-input';
import { dashboardPathFor, useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authErrorMessage } from '@/shared/errors';
import type { UserType } from '@/shared/types';

/**
 * Administrator sign-in.
 *
 * A separate door, not a separate lock. There is one credential store — Firebase Auth —
 * and one authority on who is an administrator: the `userType` field on the user
 * document, which `firestore.rules` will not let an account write to itself. This page
 * cannot grant anything the rules would refuse, and a hidden URL is not a security
 * control. What it is: a clear place for the one person who needs it, and a check that
 * fails loudly when the account is not an administrator, instead of dropping a customer
 * into an admin-shaped dashboard that then 403s on every read.
 *
 * Roles are granted server-side by `npm run grant:admin`. There is no self-serve path,
 * deliberately.
 */

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormValues = z.infer<typeof schema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [wrongRole, setWrongRole] = React.useState<UserType | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setWrongRole(null);
    try {
      const profile = await signIn(values.email, values.password);

      if (profile?.userType !== 'superuser') {
        // Signed in correctly, just not an administrator. They stay signed in as
        // themselves — forcing a sign-out here would punish a customer for clicking the
        // wrong link, and it protects nothing: the rules already refuse them.
        setWrongRole(profile?.userType ?? null);
        return;
      }

      toast({ title: 'Administrator signed in', description: values.email });
      router.push('/dashboard/superuser');
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      form.setError('password', { message: authErrorMessage(code) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      <Card className="border-primary/30">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">Platform administration</CardTitle>
          <CardDescription>
            Approvals, commissions, offline payments and platform-wide reporting.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {wrongRole && (
            <Alert variant="warning">
              <ShieldAlert />
              <AlertTitle>Not an administrator account</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  You are signed in as {wrongRole === 'organiser' ? 'an organiser' : 'a customer'}.
                  Administrator access is granted on the server and cannot be requested here.
                </p>
                <Button size="sm" variant="outline" asChild>
                  <Link href={dashboardPathFor(wrongRole)}>Go to your dashboard</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Administrator email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="admin@ticketroyality.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <PasswordInput autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" variant="royal" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Sign in to administration
              </Button>
            </form>
          </Form>

          {/*
            Worth saying on this page specifically. A reset link is useless to an
            address with no mailbox, and discovering that during an incident is the
            worst possible moment.
          */}
          <p className="text-xs text-muted-foreground">
            A reset link only works if the administrator address receives email. An address
            configured for sign-in only has to be recovered from the server.
          </p>
        </CardContent>

        <CardFooter className="justify-center border-t border-border pt-6">
          <Link
            href="/login"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to normal sign-in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
