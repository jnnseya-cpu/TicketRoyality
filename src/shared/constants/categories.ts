export interface CategoryGroup {
  label: string;
  categories: string[];
}

/**
 * Single source of truth for event categories. Used by the create/edit event form
 * AND the public search filters, so the two can never drift apart.
 *
 * Note: some category names repeat across groups (e.g. "Festivals", "Workshops").
 * Always build React keys as `${group.label}-${category}` — never the bare name.
 */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Business & Professional',
    categories: [
      'Networking',
      'Seminars',
      'Workshops',
      'Conferences',
      'Trade Shows',
      'Career Fairs',
    ],
  },
  {
    label: 'Food & Drink',
    categories: [
      'Cooking Classes',
      'Wine Tastings',
      'Food Festivals',
      'Farmers Markets',
      'Cocktail Parties',
    ],
  },
  {
    label: 'Music',
    categories: ['Concerts', 'Festivals', 'Live Music', 'Jazz', 'Electronic Events'],
  },
  {
    label: 'Performing & Visual Arts',
    categories: ['Theater', 'Dance', 'Comedy', 'Art Exhibitions', 'Craft Fairs'],
  },
  {
    label: 'Sports & Fitness',
    categories: [
      'Running Races',
      'Yoga Classes',
      'Team Sports',
      'Sports Tournaments',
      'Wellness Events',
      'Fitness Class',
      'Gym Workout',
    ],
  },
  {
    label: 'Charity & Causes',
    categories: [
      'Fundraising Events',
      'Volunteer Events',
      'Non-Profit Events',
      'Environmental Causes',
    ],
  },
  {
    label: 'Community & Culture',
    categories: ['Festivals', 'Social Gatherings', 'Cultural Events', 'Educational Events'],
  },
  {
    label: 'Hobbies & Interests',
    categories: [
      'Gaming',
      'Crafting Workshops',
      'Science & Technology',
      'Outdoor Activities',
    ],
  },
  {
    label: 'Family & Education',
    categories: [
      "Kids' Activities",
      'Parenting Workshops',
      'School Events',
      'Weddings',
      'Birthdays',
    ],
  },
  {
    label: 'Spirituality & Religion',
    categories: ['Religious Services', 'Workshops', 'Retreats'],
  },
];

/** Unique `group::category` value used as the stored category identifier. */
export function categoryValue(group: string, category: string) {
  return `${group}::${category}`;
}

export function parseCategoryValue(value: string): { group: string; category: string } {
  const [group, category] = value.split('::');
  return { group: group ?? '', category: category ?? value };
}

export const ALL_CATEGORY_VALUES = CATEGORY_GROUPS.flatMap((group) =>
  group.categories.map((category) => ({
    group: group.label,
    category,
    value: categoryValue(group.label, category),
  }))
);
