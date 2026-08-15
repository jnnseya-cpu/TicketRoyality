'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/frontend/components/ui/form';
import { Input } from '@/frontend/components/ui/input';
import { PasswordInput } from '@/frontend/components/ui/password-input';
import { Honeypot, checkHumanity, useHumanityGate } from '@/frontend/components/auth/HumanityGate';
import { Progress } from '@/frontend/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authErrorMessage } from '@/shared/errors';
import { COUNTRIES } from '@/shared/constants/countries';
import { cn } from '@/shared/utils';

const schema = z
  .object({
    // Step 1 — account
    fullName: z.string().min(2, 'Enter your full name.'),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string(),
    phone: z.string().min(6, 'Enter a contact number.'),
    // Step 2 — company & address
    companyName: z.string().min(2, 'Enter your company or promoter name.'),
    line1: z.string().min(3, 'Enter your address.'),
    city: z.string().min(2, 'Enter your city.'),
    postcode: z.string().min(3, 'Enter your postcode.'),
    country: z.string().min(2, 'Select your country.'),
    // Step 3 — branding
    website: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
    bio: z.string().max(500, 'Keep it under 500 characters.').optional(),
    logoUrl: z.string().url('Enter a valid image URL.').optional().or(z.literal('')),
    coverUrl: z.string().url('Enter a valid image URL.').optional().or(z.literal('')),
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    twitter: z.string().optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

type FormValues = z.infer<typeof schema>;

/** Fields validated before each step is allowed to advance. */
const STEP_FIELDS: Array<Array<keyof FormValues>> = [
  ['fullName', 'email', 'password', 'confirmPassword', 'phone'],
  ['companyName', 'line1', 'city', 'postcode', 'country'],
  ['website', 'bio', 'logoUrl', 'coverUrl'],
];

const STEP_LABELS = ['Account', 'Company', 'Branding'];

export function OrganiserRegistrationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { register } = useAuth();
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      companyName: '',
      line1: '',
      city: '',
      postcode: '',
      country: 'United Kingdom',
      website: '',
      bio: '',
      logoUrl: '',
      coverUrl: '',
      facebook: '',
      instagram: '',
      twitter: '',
    },
  });

  // Validate only the current step's fields — validating the whole form would block
  // step 1 on fields the user has not reached yet.
  const nextStep = async () => {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEP_FIELDS.length - 1));
  };

  const humanity = useHumanityGate();

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      // Scored on the server before an account exists. A refusal here means no
      // Firebase user is created at all, rather than one created and then cleaned up.
      const verdict = await checkHumanity(values.email, humanity.collect());
      if (!verdict.allowed) {
        toast({
          variant: 'destructive',
          title: 'We could not verify this sign-up',
          description: verdict.message,
        });
        setSubmitting(false);
        return;
      }

      await register({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        userType: 'organiser',
        profile: {
          phone: values.phone,
          companyName: values.companyName,
          website: values.website || undefined,
          bio: values.bio || undefined,
          logoUrl: values.logoUrl || undefined,
          coverUrl: values.coverUrl || undefined,
          socials: {
            facebook: values.facebook || undefined,
            instagram: values.instagram || undefined,
            twitter: values.twitter || undefined,
          },
          address: {
            line1: values.line1,
            city: values.city,
            postcode: values.postcode,
            country: values.country,
          },
        },
      });
      toast({
        title: 'Application submitted',
        description:
          'Your organiser account is pending review. You can explore the dashboard while you wait.',
      });
      router.push('/dashboard/organiser');
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      toast({
        variant: 'destructive',
        title: 'Registration failed',
        description: authErrorMessage(code),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply as an event organiser</CardTitle>
        <CardDescription>
          Publish events, sell tiered and VIP tickets, run door check-in and track revenue. New
          organisers are reviewed before their first event goes live.
        </CardDescription>
        <div className="pt-3">
          <Progress value={((step + 1) / STEP_FIELDS.length) * 100} />
          <div className="mt-2 flex justify-between text-xs">
            {STEP_LABELS.map((label, index) => (
              <span
                key={label}
                className={cn(
                  'flex items-center gap-1',
                  index <= step ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {index < step && <Check className="h-3 w-3" />}
                {label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="relative space-y-5"
              {...humanity.formProps}
            >
              <Honeypot onChange={humanity.setHoneypot} />
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" autoComplete="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Company / promoter name</FormLabel>
                      <FormControl>
                        <Input autoComplete="organization" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="line1"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Registered address</FormLabel>
                      <FormControl>
                        <Input autoComplete="address-line1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input autoComplete="address-level2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode</FormLabel>
                      <FormControl>
                        <Input autoComplete="postal-code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Country</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Website (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>About your events</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormDescription>Shown on your public organiser page.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="coverUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cover image URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(['facebook', 'instagram', 'twitter'] as const).map((social) => (
                  <FormField
                    key={social}
                    control={form.control}
                    name={social}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="capitalize">{social}</FormLabel>
                        <FormControl>
                          <Input placeholder="@handle" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              {step < STEP_FIELDS.length - 1 ? (
                <Button type="button" variant="royal" className="flex-1" onClick={nextStep}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" variant="royal" className="flex-1" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit application
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
