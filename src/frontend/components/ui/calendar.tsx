'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/shared/utils';
import { buttonVariants } from '@/frontend/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Month + year are rendered as dropdowns so users can jump decades in two clicks —
 * essential for date-of-birth fields.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      startMonth={new Date(1920, 0)}
      endMonth={new Date(new Date().getFullYear() + 5, 11)}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'hidden',
        dropdowns: 'flex items-center gap-2',
        dropdown_root: 'relative',
        dropdown:
          'h-9 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
        nav: 'flex items-center gap-1 absolute right-2 top-3 z-10',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 p-0 opacity-60 hover:opacity-100'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 p-0 opacity-60 hover:opacity-100'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100'
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        today: '[&>button]:bg-accent/20 [&>button]:text-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" {...rest} />
          ) : (
            <ChevronRight className="h-4 w-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
