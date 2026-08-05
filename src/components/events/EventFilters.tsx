'use client';

import { CalendarRange, LayoutGrid, MapPin, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CATEGORY_GROUPS, categoryValue } from '@/shared/constants/categories';

export interface EventFilterState {
  search: string;
  category: string;
  freeOnly: boolean;
  onlineOnly: boolean;
  livestreamOnly: boolean;
}

interface EventFiltersProps {
  value: EventFilterState;
  onChange: (next: EventFilterState) => void;
  view: 'grid' | 'calendar';
  onViewChange: (view: 'grid' | 'calendar') => void;
  locationStatus?: React.ReactNode;
  onUseLocation?: () => void;
  showLocationButton?: boolean;
}

export function EventFilters({
  value,
  onChange,
  view,
  onViewChange,
  locationStatus,
  onUseLocation,
  showLocationButton,
}: EventFiltersProps) {
  const set = <K extends keyof EventFilterState>(key: K, next: EventFilterState[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search events worldwide by name, venue or city…"
            className="pl-9"
            aria-label="Search events"
          />
        </div>

        <Select value={value.category} onValueChange={(next) => set('category', next)}>
          <SelectTrigger className="lg:w-72" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.categories.map((category) => {
                  // Names repeat across groups ("Festivals", "Workshops"), so the key
                  // and the value must both be scoped by group to stay unique.
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

        <div className="flex gap-1 rounded-md border border-border p-1">
          <Button
            type="button"
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('grid')}
          >
            <LayoutGrid className="h-4 w-4" /> List
          </Button>
          <Button
            type="button"
            variant={view === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('calendar')}
          >
            <CalendarRange className="h-4 w-4" /> Calendar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-free"
            checked={value.freeOnly}
            onCheckedChange={(checked) => set('freeOnly', checked === true)}
          />
          <Label htmlFor="filter-free" className="cursor-pointer">
            Free events
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-online"
            checked={value.onlineOnly}
            onCheckedChange={(checked) => set('onlineOnly', checked === true)}
          />
          <Label htmlFor="filter-online" className="cursor-pointer">
            Online events
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-livestream"
            checked={value.livestreamOnly}
            onCheckedChange={(checked) => set('livestreamOnly', checked === true)}
          />
          <Label htmlFor="filter-livestream" className="cursor-pointer">
            Live stream
          </Label>
        </div>

        {showLocationButton && onUseLocation && (
          <Button type="button" variant="outline" size="sm" onClick={onUseLocation}>
            <MapPin className="h-4 w-4" /> Use my location
          </Button>
        )}

        {locationStatus && (
          <p className="text-xs text-muted-foreground">{locationStatus}</p>
        )}
      </div>
    </div>
  );
}
