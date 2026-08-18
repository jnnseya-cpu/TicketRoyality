'use client';

import * as React from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { KeyRound, Loader2, MailCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/frontend/components/ui/form';
import { Input } from '@/frontend/components/ui/input';
import { useAuth } from '@/frontend/hooks/use-auth';
import { describeError } from '@/shared/errors';

const schema = z.object({ email: z.string().email('Enter a valid email address.') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await resetPassword(values.email);
      setSent(true);
    } catch (error) {
      console.error('[forgot-password]', error);
      form.setError('email', { message: describeError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      <Card>
        <CardHeader className="text-center">
          <KeyRound className="mx-auto h-8 w-8 text-primary" />
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We will email you a secure link to choose a new password.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {sent ? (
            <Alert variant="success">
              <MailCheck />
              <AlertTitle>Check your inbox</AlertTitle>
              <AlertDescription>
                If an account exists for that address, a reset link is on its way. The link expires
                in one hour.
              </AlertDescription>
            </Alert>
          ) : (
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
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            </Form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-border pt-6">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
