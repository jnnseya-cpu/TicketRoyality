'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Info, Loader2, LogIn, ShieldCheck } from 'lucide-react';

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
import { Logo } from '@/frontend/components/common/Logo';
import { useToast } from '@/frontend/hooks/use-toast';
import { dashboardPathFor, useAuth } from '@/frontend/hooks/use-auth';
import { authErrorMessage } from '@/shared/errors';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormValues = z.infer<typeof schema>;

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
                Sign-in needs the <code>NEXT_PUBLIC_FIREBASE_*</code> variables. Until they are
                set, no account can be created or signed in to.
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
                      <PasswordInput autoComplete="current-password" {...field} />
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

          {/*
            The administrator door. Named, not hidden — this form signs in administrators
            perfectly well, so a secret URL would buy nothing but a support question.
            What keeps administration safe is that `userType` is granted server-side by
            `npm run grant:admin` and `firestore.rules` refuses a self-write to it.

            The panel replaced here was the opposite of this: it listed
            admin@ticketroyality.com and its password in plain sight, handing an attacker
            the one address worth attacking.
          */}
          <Link
            href="/login/admin"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Platform administrator sign-in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
