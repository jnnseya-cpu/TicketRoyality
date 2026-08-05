'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Info, Loader2, LogIn } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/common/Logo';
import { useToast } from '@/hooks/use-toast';
import { dashboardPathFor, useAuth } from '@/hooks/use-auth';
import { authErrorMessage } from '@/lib/errors';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormValues = z.infer<typeof schema>;

const TEST_ACCOUNTS = [
  { role: 'Platform admin', email: 'admin@ticketroyality.com' },
  { role: 'Event organiser', email: 'organiser@ticketroyality.com' },
  { role: 'Customer', email: 'customer@ticketroyality.com' },
];

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signIn, demoMode } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const profile = await signIn(values.email, values.password);
      toast({ title: 'Welcome back', description: `Signed in as ${values.email}` });
      router.push(dashboardPathFor(profile?.userType));
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      form.setError('password', { message: authErrorMessage(code) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] max-w-lg flex-col justify-center py-12">
      <Card>
        <CardHeader className="text-center">
          <Logo className="mx-auto h-8 w-8" />
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to manage your tickets and events.</CardDescription>
        </CardHeader>

        <CardContent>
          {demoMode && (
            <Alert className="mb-6">
              <Info />
              <AlertTitle>Firebase is not configured</AlertTitle>
              <AlertDescription>
                Real sign-in needs the <code>NEXT_PUBLIC_FIREBASE_*</code> variables. In the
                meantime, use the{' '}
                <Link href="/dev-access" className="font-medium text-primary hover:underline">
                  developer access portal
                </Link>{' '}
                to explore every dashboard.
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                      <Link
                        href="/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" variant="royal" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Log in
              </Button>
            </form>
          </Form>
        </CardContent>

        <CardFooter className="flex-col gap-4 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            New to TicketRoyality?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>

          <div className="w-full rounded-md border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Development test accounts
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {TEST_ACCOUNTS.map((account) => (
                <li key={account.email} className="flex justify-between gap-2">
                  <span>{account.role}</span>
                  <span className="font-mono">{account.email}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Register each address once to create it in your Firebase project, then use{' '}
              <Link href="/dev-access" className="text-primary hover:underline">
                /dev-access
              </Link>{' '}
              to set its role.
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
