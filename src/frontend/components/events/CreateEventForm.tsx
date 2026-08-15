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
        { id: 'general', name: 'General Admission', description: '', price: 25, quantity: 200 },
      ],
      seating: [],
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
    })),
    seating: event.seating ?? [],
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
  const speakers = useFieldArray({ control: form.control, name: 'speakers' });

  const eventType = form.watch('eventType');
  const isRecurring = form.watch('isRecurring');
  const watchedSeating = form.watch('seating');
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
          price: tier.price,
          quantity: tier.quantity,
          sold: 0,
        })),
        seating: values.seating.length > 0 ? values.seating : undefined,
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

      if (existingEvent) {
        await updateEvent(existingEvent.id, payload);
        toast({ title: 'Event updated', description: values.title });
      } else {
        await createEvent(payload);
        toast({ title: 'Event created', description: values.title });
      }
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
