import Image from 'next/image';

import { Card, CardContent } from '@/frontend/components/ui/card';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';
import type { Speaker } from '@/shared/types';

export function EventSpeakers({ speakers }: { speakers: Speaker[] }) {
  if (speakers.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-headline text-xl font-semibold">Speakers</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {speakers.map((speaker) => (
          <Card key={`${speaker.name}-${speaker.title}`} className="bg-card/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                <Image
                  src={speaker.photoUrl || PLACEHOLDER_IMAGES.speakerFallback}
                  alt={speaker.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{speaker.name}</p>
                <p className="truncate text-sm text-muted-foreground">{speaker.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
