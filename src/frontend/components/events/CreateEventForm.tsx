'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Calendar } from '@/frontend/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Checkbox } from '@/frontend/components/ui/checkbox';
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
import { Label } from '@/frontend/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Separator } from '@/frontend/components/ui/separator';
import { Textarea } from '@/frontend/components/ui/textarea';
import { SeatMapPreview } from '@/frontend/components/events/SeatMapPreview';
import { TierEconomics } from '@/frontend/components/pricing/TierEconomics';
import { Switch } from '@/frontend/components/ui/switch';
import { cn } from '@/shared/utils';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { useToast } from '@/frontend/hooks/use-toast';
import { createEvent, updateEvent } from '@/shared/data/repositories';
import { CATEGORY_GROUPS, categoryValue, parseCategoryValue } from '@/shared/constants/categories';
import { COUNTRIES } from '@/shared/constants/countries';
import { eventImageSeed } from '@/shared/constants/placeholder-images';
import type { Event, UserProfile } from '@/shared/types';

const SECTION_COLORS = ['#E0A82E', '#3B82F6', '#EF4444', '#10B981', '#A855F7', '#F97316'];

const ticketTierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name this tier.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price cannot be negative.'),
  quantity: z.coerce.number().int().min(1, 'At least one ticket.'),
  /**
   * `choose` is pay-what-you-want: the giver names the amount, above `minPrice`. A mode
   * rather than a separate tier type because everything downstream — inventory,
   * issuance, the fee, the payout — is identical; only who decides the number changes.
   */
  pricing: z.enum(['fixed', 'choose']),
  minPrice: z.coerce.number().min(0),
  suggestedPrice: z.coerce.number().min(0),
  /** `hidden` needs an access code to see and, more importantly, to buy. */
  visibility: z.enum(['public', 'hidden']),
  /**
   * Write-only in this form. The code is never returned to the browser — the organiser
   * sees which tiers have one, not what it is, because a form that repopulates a secret
   * is a secret in every screen share.
   */
  accessCode: z.string().optional(),
});

const seatingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name this section.'),
  color: z.string().min(1),
  price: z.coerce.number().min(0),
  startRow: z.string().min(1).max(1, 'One letter, e.g. A.'),
  rows: z.coerce.number().int().min(1).max(26),
  seatsPerRow: z.coerce.number().int().min(1).max(60),
});

/**
 * A zone is a door, not a price band.
 *
 * `capacity` is a string in the form because an empty field must mean "uncapped" rather
 * than zero — a main gate with capacity 0 would refuse everybody, and that is exactly the
 * mistake a numeric input with a blank default invites.
 */
const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name this zone.'),
  allowedTierIds: z.array(z.string()),
  capacity: z.string().optional(),
  reEntry: z.boolean(),
});

/**
 * A hospitality package is a table, not a tier.
 *
 * It references a tier rather than carrying its own price, so the table sells from the
 * same inventory every other ticket sells from and there is no second way to charge.
 * `covers` seats of that tier are consumed by one booking.
 */
const hospitalitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name this package.'),
  tierId: z.string().min(1, 'Choose the ticket type it is priced from.'),
  covers: z.coerce.number().int().min(1, 'A table seats at least one.').max(60),
  // One per line in the form, an array on the event. A textarea is the honest control
  // for a list nobody knows the length of in advance.
  inclusions: z.string(),
  depositPercent: z.coerce.number().int().min(1).max(100),
  balanceDueDate: z.string().optional(),
  zoneId: z.string().optional(),
});

const speakerSchema = z.object({
  name: z.string().min(1, 'Enter a name.'),
  title: z.string().min(1, 'Enter a title.'),
  photoUrl: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
});

const schema = z
  .object({
    title: z.string().min(4, 'Give the event a clear title.'),
    description: z.string().min(20, 'Describe the event in at least 20 characters.'),
    category: z.string().min(1, 'Choose a category.'),
    imageUrl: z.string().url('Enter a valid image URL.').optional().or(z.literal('')),
    date: z.date({ required_error: 'Choose a date.' }),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM.'),
    eventType: z.enum(['physical', 'online', 'livestream']),
    location: z.string().optional(),
    country: z.string().optional(),
    lat: z.string().optional(),
    lng: z.string().optional(),
    onlineLink: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
    streamUrl: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
    streamKey: z.string().optional(),
    currency: z.string().min(3),
    ticketTiers: z.array(ticketTierSchema).min(1, 'Add at least one ticket tier.'),
    seating: z.array(seatingSchema),
    zones: z.array(zoneSchema),
    hospitality: z.array(hospitalitySchema),
    speakers: z.array(speakerSchema),
    isRecurring: z.boolean(),
    recurrenceFrequency: z.enum(['weekly', 'monthly']).optional(),
    recurrenceEndDate: z.date().optional(),
    featured: z.boolean(),
    publish: z.boolean(),
  })
  .superRefine((values, ctx) => {
    // The date+time must be in the future.
    const [hours, minutes] = values.time.split(':').map(Number);
    const when = new Date(values.date);
    when.setHours(hours, minutes, 0, 0);
    if (when.getTime() <= Date.now()) {
      ctx.addIssue({ path: ['time'], code: 'custom', message: 'The event must start in the future.' });
    }

    // Location fields are only required for physical events.
    if (values.eventType === 'physical') {
      if (!values.location || values.location.length < 3) {
        ctx.addIssue({ path: ['location'], code: 'custom', message: 'Enter the venue.' });
      }
      if (!values.country) {
        ctx.addIssue({ path: ['country'], code: 'custom', message: 'Select a country.' });
      }
    }
    if (values.eventType === 'online' && !values.onlineLink) {
      ctx.addIssue({ path: ['onlineLink'], code: 'custom', message: 'Add the joining link.' });
    }
    if (values.eventType === 'livestream' && !values.streamUrl) {
      ctx.addIssue({ path: ['streamUrl'], code: 'custom', message: 'Add the stream URL.' });
    }
    /*
     * A package priced from a tier that no longer exists cannot be sold, and a deposit
     * with no due date can never be chased — the hold that reserves the table would run
     * to the event and the organiser would find out on the night.
     */
    values.hospitality.forEach((pkg, index) => {
      if (pkg.tierId && !values.ticketTiers.some((t) => t.id === pkg.tierId)) {
        ctx.addIssue({
          path: ['hospitality', index, 'tierId'],
          code: 'custom',
          message: 'That ticket type has been removed. Choose another.',
        });
      }
      if (pkg.depositPercent < 100 && !pkg.balanceDueDate) {
        ctx.addIssue({
          path: ['hospitality', index, 'balanceDueDate'],
          code: 'custom',
          message: 'A deposit needs a date the balance is due by.',
        });
      }
      if (pkg.balanceDueDate && new Date(pkg.balanceDueDate).getTime() > values.date.getTime()) {
        ctx.addIssue({
          path: ['hospitality', index, 'balanceDueDate'],
          code: 'custom',
          message: 'The balance has to be due before the event, not after it.',
        });
      }
    });

    if (values.isRecurring && !values.recurrenceEndDate) {
      ctx.addIssue({
        path: ['recurrenceEndDate'],
        code: 'custom',
        message: 'Choose when the series ends.',
      });
    }
  });

type FormValues = z.infer<typeof schema>;

function defaultsFor(event?: Event): FormValues {
  if (!event) {
    return {
      title: '',
      description: '',
      category: '',
      imageUrl: '',
      date: new Date(Date.now() + 30 * 86_400_000),
      time: '19:00',
      eventType: 'physical',
      location: '',
      country: 'United Kingdom',
      lat: '',
      lng: '',
      onlineLink: '',
      streamUrl: '',
      streamKey: '',
      currency: 'GBP',
      ticketTiers: [
        {
          id: 'general',
          name: 'General Admission',
          description: '',
          price: 25,
          quantity: 200,
          pricing: 'fixed' as const,
          minPrice: 0,
          suggestedPrice: 0,
          visibility: 'public' as const,
          accessCode: '',
        },
      ],
      seating: [],
      zones: [],
      hospitality: [],
      speakers: [],
      isRecurring: false,
      featured: false,
      publish: true,
    };
  }

  const when = new Date(event.date);
  return {
    title: event.title,
    description: event.description,
    category: categoryValue(event.categoryGroup, event.category),
    imageUrl: event.imageUrl,
    date: when,
    time: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`,
    eventType: event.eventType,
    location: event.location,
    country: event.country,
    lat: event.coordinates ? String(event.coordinates.lat) : '',
    lng: event.coordinates ? String(event.coordinates.lng) : '',
    onlineLink: event.onlineLink ?? '',
    streamUrl: event.streamDetails?.streamUrl ?? '',
    streamKey: event.streamDetails?.streamKey ?? '',
    currency: event.currency,
    ticketTiers: event.ticketTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description ?? '',
      price: tier.price,
      quantity: tier.quantity,
      // Absent means fixed, so every tier that predates this is unchanged.
      pricing: tier.pricing ?? ('fixed' as const),
      minPrice: tier.minPrice ?? 0,
      suggestedPrice: tier.suggestedPrice ?? 0,
      visibility: tier.visibility ?? ('public' as const),
      // Deliberately blank: an existing code is never sent back to the browser. Leaving
      // it empty means "keep what is stored"; typing replaces it.
      accessCode: '',
    })),
    seating: event.seating ?? [],
    zones: (event.zones ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      allowedTierIds: z.allowedTierIds,
      // Back to a string, and `null` becomes empty rather than "null".
      capacity: z.capacity === null || z.capacity === undefined ? '' : String(z.capacity),
      reEntry: z.reEntry,
    })),
    hospitality: (event.hospitality ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      tierId: h.tierId,
      covers: h.covers,
      inclusions: (h.inclusions ?? []).join('\n'),
      depositPercent: h.depositPercent,
      // Back to the `yyyy-mm-dd` a date input needs, from the ISO string on the event.
      balanceDueDate: h.balanceDueDate ? h.balanceDueDate.slice(0, 10) : '',
      zoneId: h.zoneId ?? '',
    })),
    speakers: (event.speakers ?? []).map((s) => ({ ...s, photoUrl: s.photoUrl ?? '' })),
    isRecurring: Boolean(event.recurrence),
    recurrenceFrequency: event.recurrence?.frequency,
    recurrenceEndDate: event.recurrence ? new Date(event.recurrence.endDate) : undefined,
    featured: event.featured ?? false,
    publish: event.status === 'published',
  };
}

export function CreateEventForm({
  profile,
  existingEvent,
}: {
  profile: UserProfile;
  existingEvent?: Event;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [dateOpen, setDateOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(existingEvent),
  });

  const tiers = useFieldArray({ control: form.control, name: 'ticketTiers' });
  const seating = useFieldArray({ control: form.control, name: 'seating' });
  const zones = useFieldArray({ control: form.control, name: 'zones' });
  const hospitality = useFieldArray({ control: form.control, name: 'hospitality' });
  const speakers = useFieldArray({ control: form.control, name: 'speakers' });

  const eventType = form.watch('eventType');
  const isRecurring = form.watch('isRecurring');
  const watchedSeating = form.watch('seating');
  const watchedZones = form.watch('zones');
  const watchedHospitality = form.watch('hospitality');
  const watchedTiers = form.watch('ticketTiers');
  const currency = form.watch('currency');

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const [hours, minutes] = values.time.split(':').map(Number);
      const when = new Date(values.date);
      when.setHours(hours, minutes, 0, 0);

      const { group, category } = parseCategoryValue(values.category);
      const cheapest = Math.min(...values.ticketTiers.map((t) => t.price));

      const payload: Omit<Event, 'id' | 'createdAt'> = {
        title: values.title,
        description: values.description,
        category,
        categoryGroup: group,
        imageUrl: values.imageUrl || eventImageSeed(values.title),
        date: when.toISOString(),
        eventType: values.eventType,
        location: values.eventType === 'physical' ? (values.location ?? '') : 'Online',
        country: values.country ?? 'United Kingdom',
        coordinates:
          values.eventType === 'physical' && values.lat && values.lng
            ? { lat: Number(values.lat), lng: Number(values.lng) }
            : undefined,
        onlineLink: values.eventType === 'online' ? values.onlineLink || undefined : undefined,
        streamDetails:
          values.eventType === 'livestream'
            ? {
                streamUrl: values.streamUrl ?? '',
                streamKey: values.streamKey || undefined,
                chatEnabled: true,
              }
            : undefined,
        price: Number.isFinite(cheapest) ? cheapest : 0,
        currency: values.currency,
        ticketTiers: values.ticketTiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          description: tier.description || undefined,
          // On a `choose` tier the stored price is the floor, so every existing
          // "from £x" display, the catalogue lead price and the seat map keep working
          // without knowing pay-what-you-want exists. What is charged is resolved
          // server-side from `pricing` and `minPrice`.
          price: tier.pricing === 'choose' ? tier.minPrice : tier.price,
          quantity: tier.quantity,
          sold: 0,
          ...(tier.pricing === 'choose'
            ? {
                pricing: 'choose' as const,
                minPrice: tier.minPrice,
                suggestedPrice: tier.suggestedPrice || undefined,
              }
            : {}),
          ...(tier.visibility === 'hidden' ? { visibility: 'hidden' as const } : {}),
        })),
        seating: values.seating.length > 0 ? values.seating : undefined,
        zones:
          values.zones.length > 0
            ? values.zones.map((z) => ({
                id: z.id,
                name: z.name,
                allowedTierIds: z.allowedTierIds,
                // Empty means uncapped. Occupancy is owned by the door and is never
                // written from here — sending it would reset a live count mid-event.
                capacity: z.capacity?.trim() ? Number(z.capacity) : null,
                reEntry: z.reEntry,
              }))
            : undefined,
        hospitality:
          values.hospitality.length > 0
            ? values.hospitality.map((h) => ({
                id: h.id,
                name: h.name,
                tierId: h.tierId,
                covers: h.covers,
                inclusions: h.inclusions
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
                depositPercent: h.depositPercent,
                balanceDueDate: h.balanceDueDate
                  ? new Date(h.balanceDueDate).toISOString()
                  : undefined,
                zoneId: h.zoneId || undefined,
              }))
            : undefined,
        capacity: values.ticketTiers.reduce((sum, tier) => sum + tier.quantity, 0),
        organizerId: profile.uid,
        organizerName: profile.companyName ?? profile.fullName,
        organizerLogoUrl: profile.logoUrl,
        speakers:
          values.speakers.length > 0
            ? values.speakers.map((s) => ({ ...s, photoUrl: s.photoUrl || undefined }))
            : undefined,
        recurrence:
          values.isRecurring && values.recurrenceEndDate
            ? {
                frequency: values.recurrenceFrequency ?? 'weekly',
                endDate: values.recurrenceEndDate.toISOString(),
              }
            : undefined,
        featured: values.featured,
        // Organisers self-approve: publishing is theirs to control, subject to
        // their account being approved at the platform level.
        status: values.publish ? 'published' : 'draft',
      };

      const eventId = existingEvent
        ? (await updateEvent(existingEvent.id, payload), existingEvent.id)
        : await createEvent(payload);

      /*
       * Access codes go to the server separately, never onto the event document.
       * Published events are readable by anyone, so a code stored there — hashed or not —
       * is a short secret sitting in public data.
       *
       * A blank field means "keep what is stored", so an organiser editing the date does
       * not silently wipe the code their partners are already using.
       */
      const codes: Record<string, string> = {};
      for (const tier of values.ticketTiers) {
        if (tier.visibility === 'hidden' && tier.accessCode?.trim()) {
          codes[tier.id] = tier.accessCode.trim();
        }
      }
      if (Object.keys(codes).length > 0) {
        const response = await authedFetch(`/api/events/${eventId}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes }),
        });
        if (!response.ok) {
          // The event saved; the code did not. Said out loud rather than swallowed —
          // a hidden tier with no working code is a tier nobody can buy.
          toast({
            variant: 'destructive',
            title: 'Event saved, access code was not',
            description: 'Open the event again and re-enter the code.',
          });
        }
      }

      toast({
        title: existingEvent ? 'Event updated' : 'Event created',
        description: values.title,
      });
      router.push('/dashboard/organiser/events');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: existingEvent ? 'Could not update event' : 'Could not create event',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardDescription>What it is, when it happens and who it is for.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Royal Night Live — Wembley Stadium" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-80">
                      {CATEGORY_GROUPS.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.categories.map((category) => {
                            // Composite key/value — "Festivals" and "Workshops" each
                            // appear under two groups.
                            const scoped = categoryValue(group.label, category);
                            return (
                              <SelectItem key={scoped} value={scoped}>
                                {category}
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover image URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://" {...field} />
                  </FormControl>
                  <FormDescription>Leave blank to auto-generate a placeholder.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button type="button" variant="outline" className="justify-start font-normal">
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
                          setDateOpen(false);
                        }}
                        disabled={{ before: new Date() }}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Format &amp; location</CardTitle>
            <CardDescription>
              Physical events appear in nearby-events search; online and live stream events appear
              under their own filters.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Event type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="physical">Physical venue</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="livestream">Live stream</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {eventType === 'physical' && (
              <>
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Venue</FormLabel>
                      <FormControl>
                        <Input placeholder="Symphony Hall, Birmingham" {...field} />
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
                <FormField
                  control={form.control}
                  name="lat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input placeholder="52.4796" {...field} />
                      </FormControl>
                      <FormDescription>Powers the map and distance search.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lng"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input placeholder="-1.9106" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {eventType === 'online' && (
              <FormField
                control={form.control}
                name="onlineLink"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Joining link</FormLabel>
                    <FormControl>
                      <Input placeholder="https://meet.example.com/…" {...field} />
                    </FormControl>
                    <FormDescription>Sent to attendees with their ticket.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {eventType === 'livestream' && (
              <>
                <FormField
                  control={form.control}
                  name="streamUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stream URL (RTMP/HLS)</FormLabel>
                      <FormControl>
                        <Input placeholder="rtmp://ingest.example.com/live" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="streamKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stream key</FormLabel>
                      <FormControl>
                        <PasswordInput {...field} />
                      </FormControl>
                      <FormDescription>Kept private, never shown to attendees.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>
              Early bird, general, VIP, hospitality — as many tiers as you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem className="max-w-[12rem]">
                  <FormLabel>Currency</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {['GBP', 'USD', 'EUR', 'ZAR', 'NGN', 'KES'].map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tiers.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.name`}
                  render={({ field: f }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Tier name</FormLabel>
                      <FormControl>
                        <Input {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.price`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Price ({currency})</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.quantity`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.description`}
                  render={({ field: f }) => (
                    <FormItem className="sm:col-span-3">
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/*
                  Pay what you want. A donation, an offering and a wedding contribution
                  are the same shape: the giver decides. Forcing that into a priced tier
                  makes them choose between the amount they meant and the amount on the
                  button, and the platform loses the difference either way.
                */}
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.pricing`}
                  render={({ field: f }) => (
                    <FormItem className="flex flex-col justify-center sm:col-span-4">
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={f.value === 'choose'}
                            onCheckedChange={(on) => f.onChange(on ? 'choose' : 'fixed')}
                          />
                        </FormControl>
                        <span className="text-sm">
                          {f.value === 'choose'
                            ? 'The buyer chooses what to pay'
                            : 'Fixed price'}
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                {/*
                  Hidden tiers: a corporate rate, a partner allocation, an artist guest
                  list. The switch hides it on the page; the code is what actually stops
                  it being bought, and that is enforced server-side at checkout.
                */}
                <FormField
                  control={form.control}
                  name={`ticketTiers.${index}.visibility`}
                  render={({ field: f }) => (
                    <FormItem className="flex flex-col justify-center sm:col-span-4">
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={f.value === 'hidden'}
                            onCheckedChange={(on) => f.onChange(on ? 'hidden' : 'public')}
                          />
                        </FormControl>
                        <span className="text-sm">
                          {f.value === 'hidden'
                            ? 'Hidden — needs an access code'
                            : 'Visible to everyone'}
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                {watchedTiers[index]?.visibility === 'hidden' && (
                  <FormField
                    control={form.control}
                    name={`ticketTiers.${index}.accessCode`}
                    render={({ field: f }) => (
                      <FormItem className="sm:col-span-4">
                        <FormLabel>Access code</FormLabel>
                        <FormControl>
                          <Input placeholder="BOARD2026" autoComplete="off" {...f} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Spaces and capitals are ignored. Stored where no browser can read
                          it, so leave this blank to keep the code you already set. Anyone
                          reading the raw event data can still see that a hidden tier exists
                          and what it costs — the code stops them buying it, not seeing it.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchedTiers[index]?.pricing === 'choose' && (
                  <>
                    <FormField
                      control={form.control}
                      name={`ticketTiers.${index}.minPrice`}
                      render={({ field: f }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Minimum ({currency})</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.01" {...f} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Enforced on the server. Zero genuinely allows nothing, which is a
                            valid choice for a free service with an optional collection.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`ticketTiers.${index}.suggestedPrice`}
                      render={({ field: f }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Suggested ({currency})</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.01" {...f} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Pre-filled on the event page. Never enforced — a suggestion that
                            cannot be changed is a price.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => tiers.remove(index)}
                    disabled={tiers.fields.length === 1}
                    aria-label="Remove tier"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Shown while they type the price, because "£50 stays £50" contradicts
                    what every other platform has taught them to expect. */}
                <div className="sm:col-span-4 rounded-md bg-secondary/50 p-3">
                  <TierEconomics
                    price={Number(form.watch(`ticketTiers.${index}.price`)) || 0}
                    currency={currency}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                tiers.append({
                  id: `tier-${tiers.fields.length + 1}-${Date.now()}`,
                  name: '',
                  description: '',
                  price: 0,
                  quantity: 100,
                  pricing: 'fixed',
                  minPrice: 0,
                  suggestedPrice: 0,
                  visibility: 'public',
                  accessCode: '',
                })
              }
            >
              <PlusCircle className="h-4 w-4" /> Add ticket tier
            </Button>
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Venue zones</CardTitle>
            <CardDescription>
              Doors inside the venue. A zone admits only the ticket types you assign to it,
              holds only as many people as you allow, and can refuse re-entry. Leave this
              empty if the event has one gate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {zones.fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-lg border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`zones.${index}.name`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Zone name</FormLabel>
                        <FormControl>
                          <Input placeholder="VIP lounge" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`zones.${index}.capacity`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Capacity</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} placeholder="Uncapped" {...f} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Blank means no limit. The door counts who is inside now.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`zones.${index}.reEntry`}
                    render={({ field: f }) => (
                      <FormItem className="flex flex-col justify-center">
                        <FormLabel>Re-entry</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Switch checked={f.value} onCheckedChange={f.onChange} />
                          </FormControl>
                          <span className="text-sm text-muted-foreground">
                            {f.value ? 'Can leave and return' : 'One entry only'}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                {/*
                  Checkboxes rather than a multi-select, because the consequence of
                  getting this wrong is somebody refused at a door. All of it has to be
                  visible at once, not behind a dropdown.
                */}
                <FormField
                  control={form.control}
                  name={`zones.${index}.allowedTierIds`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Ticket types this door admits</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {watchedTiers.map((tier) => {
                          const checked = f.value.includes(tier.id);
                          return (
                            <button
                              key={tier.id}
                              type="button"
                              onClick={() =>
                                f.onChange(
                                  checked
                                    ? f.value.filter((id: string) => id !== tier.id)
                                    : [...f.value, tier.id]
                                )
                              }
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs transition-colors',
                                checked
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/40'
                              )}
                            >
                              {tier.name || 'Unnamed tier'}
                            </button>
                          );
                        })}
                      </div>
                      <FormDescription className="text-xs">
                        {f.value.length === 0
                          ? 'None selected — this door admits every ticket type, like a main gate.'
                          : `Only these ${f.value.length} will be let in. Everything else is refused.`}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <Button type="button" variant="outline" size="sm" onClick={() => zones.remove(index)}>
                  <Trash2 className="h-4 w-4" /> Remove zone
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                zones.append({
                  id: `zone-${zones.fields.length + 1}-${Date.now()}`,
                  name: '',
                  allowedTierIds: [],
                  capacity: '',
                  reEntry: true,
                })
              }
            >
              <PlusCircle className="h-4 w-4" /> Add zone
            </Button>

            {watchedZones.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Scan for a zone from the check-in page by choosing it at the door. A zone scan
                checks the ticket may be in that room — it does not use the ticket up, so
                someone can step out and come back where you allow it.
              </p>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Hospitality packages</CardTitle>
            <CardDescription>
              Tables sold whole, with what is included, named guests, and a deposit now if you
              want one. A package is priced from one of your ticket types — the table takes
              that many places out of it — so hospitality and tickets never disagree about how
              full the room is.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hospitality.fields.map((field, index) => {
              const pkg = watchedHospitality[index];
              const tier = watchedTiers.find((t) => t.id === pkg?.tierId);
              const covers = Number(pkg?.covers) || 0;
              const quote =
                tier && covers > 0
                  ? computeOrderFees([{ faceMinor: toMinor(Number(tier.price) || 0), qty: covers }])
                  : null;
              const depositPercent = Math.min(100, Math.max(1, Number(pkg?.depositPercent) || 100));

              return (
                <div key={field.id} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.name`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Package name</FormLabel>
                          <FormControl>
                            <Input placeholder="Champagne table" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.tierId`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Priced from</FormLabel>
                          <Select onValueChange={f.onChange} value={f.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a ticket type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {watchedTiers.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name || 'Unnamed tier'} — {currency} {Number(t.price) || 0}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.covers`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Seats at the table</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={60} {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`hospitality.${index}.inclusions`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>What is included</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder={'Champagne on arrival\nThree-course dinner\nPrivate host'}
                            {...f}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          One per line. These appear on the event page exactly as written.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.depositPercent`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Payable up front</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={100} {...f} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {depositPercent >= 100
                              ? 'Paid in full at booking. Nothing to chase.'
                              : `${depositPercent}% deposit, the rest by the date below.`}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.balanceDueDate`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Balance due by</FormLabel>
                          <FormControl>
                            <Input type="date" disabled={depositPercent >= 100} {...f} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            The table is held until this date. If the balance never arrives it
                            goes back on sale.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`hospitality.${index}.zoneId`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Door</FormLabel>
                          {/* `none` is the placeholder value the select needs; it must not
                              reach the event as a zone id that no door matches. */}
                          <Select
                            onValueChange={(v) => f.onChange(v === 'none' ? '' : v)}
                            value={f.value || 'none'}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="No specific zone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No specific zone</SelectItem>
                              {watchedZones.map((z) => (
                                <SelectItem key={z.id} value={z.id}>
                                  {z.name || 'Unnamed zone'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/*
                    The buyer's number, not the face value — a table quoted at face value on
                    this screen and charged all-in at checkout is how an organiser ends up
                    telling a customer the wrong price on the phone.
                  */}
                  {quote && (
                    <p className="text-sm text-muted-foreground">
                      A buyer pays{' '}
                      <span className="font-semibold text-foreground">
                        {currency} {toMajor(quote.buyerTotalMinor).toFixed(2)}
                      </span>{' '}
                      for this table — {covers} × {currency} {Number(tier?.price ?? 0).toFixed(2)}{' '}
                      including the service fee. You receive{' '}
                      <span className="font-semibold text-foreground">
                        {currency} {toMajor(quote.organiserPayoutMinor).toFixed(2)}
                      </span>
                      {depositPercent < 100 && (
                        <>
                          , with {currency}{' '}
                          {toMajor(
                            Math.round((quote.buyerTotalMinor * depositPercent) / 100)
                          ).toFixed(2)}{' '}
                          taken as the deposit
                        </>
                      )}
                      . Tickets are issued when the balance is settled, never on the deposit.
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => hospitality.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove package
                  </Button>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              disabled={watchedTiers.length === 0}
              onClick={() =>
                hospitality.append({
                  id: `table-${hospitality.fields.length + 1}-${Date.now()}`,
                  name: '',
                  tierId: watchedTiers[0]?.id ?? '',
                  covers: 8,
                  inclusions: '',
                  depositPercent: 100,
                  balanceDueDate: '',
                  zoneId: '',
                })
              }
            >
              <PlusCircle className="h-4 w-4" /> Add hospitality package
            </Button>
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Seating map</CardTitle>
            <CardDescription>
              Define colour-coded sections with lettered rows. Seats are labelled automatically
              (A1…A20, B1…B20) and the preview updates as you type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {seating.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
                <FormField
                  control={form.control}
                  name={`seating.${index}.name`}
                  render={({ field: f }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Section</FormLabel>
                      <FormControl>
                        <Input placeholder="VIP Stalls" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`seating.${index}.color`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Colour</FormLabel>
                      <FormControl>
                        <Input type="color" className="h-10 p-1" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`seating.${index}.price`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`seating.${index}.startRow`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Start row</FormLabel>
                      <FormControl>
                        <Input maxLength={1} placeholder="A" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`seating.${index}.rows`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Rows</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={26} {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`seating.${index}.seatsPerRow`}
                  render={({ field: f }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Seats per row</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={60} {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end sm:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => seating.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove section
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                seating.append({
                  id: `section-${seating.fields.length + 1}-${Date.now()}`,
                  name: '',
                  color: SECTION_COLORS[seating.fields.length % SECTION_COLORS.length],
                  price: 0,
                  startRow: String.fromCharCode(65 + seating.fields.length),
                  rows: 5,
                  seatsPerRow: 20,
                })
              }
            >
              <PlusCircle className="h-4 w-4" /> Add seating section
            </Button>

            {watchedSeating.length > 0 && (
              <>
                <Separator />
                <SeatMapPreview sections={watchedSeating} currency={currency} />
              </>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Speakers &amp; scheduling</CardTitle>
            <CardDescription>Optional line-up and recurring series settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {speakers.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name={`speakers.${index}.name`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`speakers.${index}.title`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`speakers.${index}.photoUrl`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>Photo URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="sm:col-span-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => speakers.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove speaker
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => speakers.append({ name: '', title: '', photoUrl: '' })}
            >
              <PlusCircle className="h-4 w-4" /> Add speaker
            </Button>

            <Separator />

            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">This is a recurring event</FormLabel>
                </FormItem>
              )}
            />

            {isRecurring && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="recurrenceFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Weekly" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recurrenceEndDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Series ends</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button type="button" variant="outline" className="justify-start font-normal">
                              <CalendarIcon className="h-4 w-4" />
                              {field.value ? field.value.toDateString() : 'Select a date'}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={{ before: new Date() }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
            <CardDescription>
              You control when this goes live. Featured placement is purchased separately from the
              promotions page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="publish"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label className="cursor-pointer">Publish immediately</Label>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="featured"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label className="cursor-pointer">
                    Request featured homepage placement (billed on approval)
                  </Label>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" variant="royal" size="lg" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {existingEvent ? 'Save changes' : 'Create event'}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
