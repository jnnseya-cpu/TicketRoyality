/**
 * A promo video for the homepage spotlight can arrive three ways: an uploaded file (a
 * Firebase Storage URL), a pasted direct video link (an .mp4/.webm on any host), or a
 * YouTube link. The first two play in a `<video>`; YouTube cannot and must be embedded in
 * an `<iframe>`. This one function decides which, so the picker and the homepage strip
 * never disagree about how a given URL should render.
 *
 * YouTube is an embed, not a new vendor account (owner-authorised) — no key, no contract,
 * the same footing as the Maps embed.
 */

export type VideoAd =
  | { kind: 'youtube'; id: string; embedUrl: string; thumbnail: string }
  | { kind: 'file'; url: string };

/** Pulls the 11-char id out of watch/short/embed/youtu.be forms; null if it isn't YouTube. */
export function youTubeId(raw: string): string | null {
  const match = raw.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function parseVideoAd(raw?: string | null): VideoAd | null {
  const url = (raw ?? '').trim();
  if (!url) return null;

  const id = youTubeId(url);
  if (id) {
    // Muted is the only way a browser lets an embed autoplay; loop needs the single-video
    // playlist trick; the rest strips YouTube's chrome so it reads as an ad, not a player.
    // youtube-nocookie keeps it out of the visitor's ad-tracking profile until they click.
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: id,
      controls: '0',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
    });
    return {
      kind: 'youtube',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Not YouTube: the field is "video URL", so treat anything else as a direct video file
  // (an uploaded Storage URL or a pasted .mp4/.webm). The <video> element ignores what it
  // cannot decode, and the cover image is always behind it as the poster.
  return { kind: 'file', url };
}
