import type { Article } from '@/shared/content/articles';

import { INTELLIGENCE_ARTICLES } from '@/shared/content/features/intelligence';
import { SELLING_ARTICLES } from '@/shared/content/features/selling';
import { OPERATIONS_ARTICLES } from '@/shared/content/features/operations';
import { MONEY_ARTICLES } from '@/shared/content/features/money';
import { TRUST_ARTICLES } from '@/shared/content/features/trust';
import { PLATFORM_ARTICLES } from '@/shared/content/features/platform';

/**
 * Feature articles, one per capability (docs/04 M1–M26).
 *
 * Split by cluster rather than held in one file, because a single 3,000-line content
 * module is where articles go to be duplicated by accident.
 *
 * Every piece here has to survive one test: would this page be worth reading by
 * someone who had already decided not to buy? A page that only makes sense as a sales
 * pitch ranks for nothing, earns no links, and drags the pages that do.
 */
export const FEATURE_ARTICLES: Article[] = [
  ...INTELLIGENCE_ARTICLES,
  ...SELLING_ARTICLES,
  ...OPERATIONS_ARTICLES,
  ...MONEY_ARTICLES,
  ...TRUST_ARTICLES,
  ...PLATFORM_ARTICLES,
];
