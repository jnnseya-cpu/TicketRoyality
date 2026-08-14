import Link from 'next/link';

import type { TextToken } from '@/shared/content/links';

/**
 * Renders a linkified run of prose.
 *
 * Tokens arrive as data from `linkify` rather than as an HTML string, so there is no
 * path by which article content can inject markup. That matters less today, when every
 * article is committed to this repository, than it will the first time anyone wires a
 * CMS to this type.
 */
export function RichText({ tokens }: { tokens: TextToken[] }) {
  return (
    <>
      {tokens.map((token, index) =>
        'href' in token ? (
          <Link
            key={index}
            href={token.href}
            className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          >
            {token.text}
          </Link>
        ) : (
          <span key={index}>{token.text}</span>
        )
      )}
    </>
  );
}
