import { splashLinks } from '@/shared/pwa/splash';

/**
 * The `apple-touch-startup-image` links.
 *
 * ## Why these are rendered rather than declared in `metadata`
 *
 * Next's metadata API has no field for a launch image, and `metadata.other` emits
 * `<meta>` tags, not `<link>`. React 19 hoists a `<link>` rendered anywhere in the tree
 * into `<head>`, which is the supported way to add one — and it keeps the list next to
 * the device table that generates the files instead of in a hand-maintained string.
 *
 * ## Why all of them ship to every browser
 *
 * Roughly 6 KB of markup, about a kilobyte compressed, sent to Android and desktop users
 * who will never use it. The alternative is sniffing the user agent to decide, which
 * would make every HTML response vary by client and cost far more in cache misses than
 * the markup saves.
 */
export function AppleSplashLinks() {
  return (
    <>
      {splashLinks().map((link) => (
        <link
          key={link.key}
          rel="apple-touch-startup-image"
          media={link.media}
          href={link.href}
        />
      ))}
    </>
  );
}
