'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Calendar } from '@/frontend/components/ui/calendar';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { useAuth } from '@/frontend/hooks/use-auth';
import { useToast } from '@/frontend/hooks/use-toast';
import { authErrorMessage } from '@/shared/errors';
import { COUNTRIES } from '@/shared/constants/countries';

/** Minimum age to purchase a ticket. */
const MIN_AGE = 13;

function isOldEnough(dob: Date) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE);
  return dob <= cutoff;
}

const schema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name.'),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string(),
    phone: z.string().min(6, 'Enter a contact number.'),
    dateOfBirth: z.date({ required_error: 'Select your date of birth.' }).refine(isOldEnough, {
      message: `You must be at least ${MIN_AGE} years old to buy tickets.`,
    }),
    line1: z.string().min(3, 'Enter your address.'),
    line2: z.string().optional(),
    city: z.string().min(2, 'Enter your city.'),
    postcode: z.string().min(3, 'Enter your postcode.'),
    country: z.string().min(2, 'Select your country.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

type FormValues = z.infer<typeof schema>;

export function CustomerRegistrationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { register } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [dobOpen, setDobOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      line1: '',
      line2: '',
      city: '',
      postcode: '',
      country: 'United Kingdom',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await register({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        userType: 'customer',
        profile: {
          phone: values.phone,
          dateOfBirth: values.dateOfBirth.toISOString(),
          address: {
            line1: values.line1,
            line2: values.line2,
            city: values.city,
            postcode: values.postcode,
            country: values.country,
          },
        },
      });
      toast({
        title: 'Welcome to TicketRoyality',
        description: 'Your account is ready. Payment methods are managed from your dashboard.',
      });
      router.push('/dashboard/customer');
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
        <CardTitle>Create your customer account</CardTitle>
        <CardDescription>
          Buy tickets, keep every QR code in one place and get recommendations tailored to you.
          Payment details are added later, from your dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
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
                    <FormLabel>Email</FormLabel>
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
                      <Input type="password" autoComplete="new-password" {...field} />
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
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of birth</FormLabel>
                    <Popover open={dobOpen} onOpenChange={setDobOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className="justify-start font-normal"
                          >
                            <CalendarIcon className="h-4 w-4" />
                            {field.value ? field.value.toDateString() : 'Select a date'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            // Close on selection — leaving it open hides the rest of the form.
                            setDobOpen(false);
                          }}
                          disabled={{ after: new Date() }}
                          defaultMonth={field.value ?? new Date(1995, 0)}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>You must be {MIN_AGE} or over to buy tickets.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Billing address</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="line1"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address line 1</FormLabel>
                      <FormControl>
                        <Input autoComplete="address-line1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="line2"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address line 2 (optional)</FormLabel>
                      <FormControl>
                        <Input autoComplete="address-line2" {...field} />
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
            </div>

            <Button type="submit" variant="royal" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By registering you agree to our{' '}
              <Link href="/terms-of-service" className="text-primary hover:underline">
                terms of service
              </Link>{' '}
              and{' '}
              <Link href="/privacy-policy" className="text-primary hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
