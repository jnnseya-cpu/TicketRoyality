import type { Event, Ticket, UserProfile } from '@/shared/types';
import { eventImageSeed, avatarSeed } from '@/shared/constants/placeholder-images';

/**
 * Demo dataset used when Firebase credentials are absent (local preview / CI).
 * As soon as NEXT_PUBLIC_FIREBASE_* is configured, live Firestore data takes over.
 */

const YEAR = 2026;

function iso(month: number, day: number, hour = 19, minute = 0) {
  return new Date(Date.UTC(YEAR, month - 1, day, hour, minute)).toISOString();
}

interface Seed {
  id: string;
  title: string;
  category: string;
  categoryGroup: string;
  location: string;
  lat: number;
  lng: number;
  price: number;
  date: string;
  eventType?: Event['eventType'];
  featured?: boolean;
  description: string;
}

const SEEDS: Seed[] = [
  {
    id: 'wembley-royal-night',
    title: 'Royal Night Live — Wembley Stadium',
    category: 'Concerts',
    categoryGroup: 'Music',
    location: 'Wembley Stadium, London',
    lat: 51.556, lng: -0.2796, price: 89, date: iso(6, 12, 19, 30), featured: true,
    description:
      'A 90,000-capacity stadium spectacular with full VIP hospitality, pitch-side packages and backstage access tiers.',
  },
  {
    id: 'birmingham-jazz-sessions',
    title: 'Birmingham Jazz Sessions',
    category: 'Jazz',
    categoryGroup: 'Music',
    location: 'Symphony Hall, Birmingham',
    lat: 52.4796, lng: -1.9106, price: 32, date: iso(4, 18, 20, 0), featured: true,
    description:
      'An intimate evening of contemporary and classic jazz with reserved seating across stalls, circle and balcony.',
  },
  {
    id: 'birmingham-tech-summit',
    title: 'Midlands Tech & AI Summit',
    category: 'Conferences',
    categoryGroup: 'Business & Professional',
    location: 'ICC Birmingham',
    lat: 52.4784, lng: -1.9127, price: 245, date: iso(5, 6, 9, 0), featured: true,
    description:
      'Two days of keynotes on applied machine learning, infrastructure automation and agentic systems.',
  },
  {
    id: 'manchester-food-festival',
    title: 'Manchester Street Food Festival',
    category: 'Food Festivals',
    categoryGroup: 'Food & Drink',
    location: 'Piccadilly Gardens, Manchester',
    lat: 53.4808, lng: -2.2374, price: 0, date: iso(7, 4, 11, 0), featured: true,
    description:
      'Free entry to 60+ independent traders, live cooking theatres and a dedicated craft drinks arena.',
  },
  {
    id: 'anfield-derby',
    title: 'Merseyside Derby — Matchday Hospitality',
    category: 'Sports Tournaments',
    categoryGroup: 'Sports & Fitness',
    location: 'Anfield, Liverpool',
    lat: 53.4308, lng: -2.9608, price: 165, date: iso(3, 21, 15, 0), featured: true,
    description:
      'Premium matchday experience with lounge access, pre-match dining and reserved seating in the Main Stand.',
  },
  {
    id: 'edinburgh-comedy-gala',
    title: 'Edinburgh Comedy Gala',
    category: 'Comedy',
    categoryGroup: 'Performing & Visual Arts',
    location: 'Usher Hall, Edinburgh',
    lat: 55.9469, lng: -3.2053, price: 41, date: iso(8, 15, 19, 45), featured: true,
    description:
      'Twelve headliners across one night, hosted live with a full reserved-seat auditorium map.',
  },
  {
    id: 'bristol-electronic-warehouse',
    title: 'Bristol Warehouse Electronic',
    category: 'Electronic Events',
    categoryGroup: 'Music',
    location: 'Motion, Bristol',
    lat: 51.4593, lng: -2.5769, price: 28, date: iso(9, 26, 22, 0), featured: true,
    description:
      'All-night warehouse rave across three rooms with capped capacity and instant QR entry.',
  },
  {
    id: 'cardiff-charity-run',
    title: 'Cardiff Bay Charity Half Marathon',
    category: 'Running Races',
    categoryGroup: 'Sports & Fitness',
    location: 'Cardiff Bay, Cardiff',
    lat: 51.4636, lng: -3.1636, price: 35, date: iso(5, 24, 8, 30), featured: true,
    description:
      'A fast, flat waterfront course. Every entry funds local youth sport programmes.',
  },
  {
    id: 'leeds-art-exhibition',
    title: 'Leeds Contemporary Art Exhibition',
    category: 'Art Exhibitions',
    categoryGroup: 'Performing & Visual Arts',
    location: 'Leeds Art Gallery',
    lat: 53.7997, lng: -1.5492, price: 15, date: iso(4, 2, 10, 0), featured: true,
    description:
      'A curated survey of emerging British artists with timed-entry ticketing and guided tour add-ons.',
  },
  {
    id: 'global-ai-livestream',
    title: 'Global AI Infrastructure Livestream',
    category: 'Science & Technology',
    categoryGroup: 'Hobbies & Interests',
    location: 'Online',
    lat: 51.5072, lng: -0.1276, price: 12, date: iso(3, 9, 17, 0),
    eventType: 'livestream',
    description:
      'Broadcast-quality livestream with live chat, Q&A polling and on-demand replay for ticket holders.',
  },
  {
    id: 'remote-yoga-series',
    title: 'Sunrise Yoga — Online Series',
    category: 'Yoga Classes',
    categoryGroup: 'Sports & Fitness',
    location: 'Online',
    lat: 51.5072, lng: -0.1276, price: 0, date: iso(2, 14, 7, 0),
    eventType: 'online',
    description: 'Free six-week online yoga series with recorded sessions for every participant.',
  },
  {
    id: 'birmingham-networking',
    title: 'Birmingham Founders Networking',
    category: 'Networking',
    categoryGroup: 'Business & Professional',
    location: 'The Custard Factory, Birmingham',
    lat: 52.4756, lng: -1.8794, price: 18, date: iso(3, 5, 18, 30),
    description: 'Structured founder-to-investor networking with curated introductions.',
  },
  {
    id: 'glasgow-theatre-royal',
    title: 'A Winter Tale — Theatre Royal',
    category: 'Theater',
    categoryGroup: 'Performing & Visual Arts',
    location: 'Theatre Royal, Glasgow',
    lat: 55.8672, lng: -4.2528, price: 54, date: iso(11, 12, 19, 30),
    description: 'A full-house production with numbered seating across stalls, dress and upper circle.',
  },
  {
    id: 'newcastle-wine-tasting',
    title: 'Newcastle Fine Wine Tasting',
    category: 'Wine Tastings',
    categoryGroup: 'Food & Drink',
    location: 'Grey Street, Newcastle',
    lat: 54.9714, lng: -1.6132, price: 65, date: iso(6, 27, 18, 0),
    description: 'Twelve estates, one sommelier, one very good evening. Strictly 40 seats.',
  },
  {
    id: 'brighton-gaming-expo',
    title: 'Brighton Indie Gaming Expo',
    category: 'Gaming',
    categoryGroup: 'Hobbies & Interests',
    location: 'Brighton Centre, Brighton',
    lat: 50.8215, lng: -0.1476, price: 22, date: iso(10, 3, 10, 0),
    description: 'Playable builds from 80 independent studios plus a competitive tournament stage.',
  },
  {
    id: 'sheffield-craft-fair',
    title: 'Sheffield Winter Craft Fair',
    category: 'Craft Fairs',
    categoryGroup: 'Performing & Visual Arts',
    location: 'Peace Gardens, Sheffield',
    lat: 53.3792, lng: -1.4703, price: 0, date: iso(12, 6, 10, 0),
    description: 'Free-entry maker market with over 120 stalls and live demonstrations.',
  },
  {
    id: 'nottingham-wellness-retreat',
    title: 'Nottingham Wellness Retreat',
    category: 'Wellness Events',
    categoryGroup: 'Sports & Fitness',
    location: 'Wollaton Hall, Nottingham',
    lat: 52.9506, lng: -1.2035, price: 120, date: iso(9, 12, 9, 0),
    description: 'A full-day retreat: breathwork, sound baths, nutrition workshops and a private dinner.',
  },
  {
    id: 'birmingham-food-market',
    title: 'Digbeth Farmers Market',
    category: 'Farmers Markets',
    categoryGroup: 'Food & Drink',
    location: 'Digbeth, Birmingham',
    lat: 52.4751, lng: -1.8845, price: 0, date: iso(2, 28, 9, 0),
    description: 'Weekly producers market with free entry and optional guided tasting tickets.',
  },
  {
    id: 'london-fundraising-gala',
    title: 'The Royal Fundraising Gala',
    category: 'Fundraising Events',
    categoryGroup: 'Charity & Causes',
    location: 'The Savoy, London',
    lat: 51.5101, lng: -0.1206, price: 350, date: iso(11, 28, 19, 0),
    description: 'Black-tie gala dinner with a silent auction, table sponsorship and VIP reception.',
  },
  {
    id: 'oxford-science-lecture',
    title: 'Oxford Open Science Lecture',
    category: 'Educational Events',
    categoryGroup: 'Community & Culture',
    location: 'Sheldonian Theatre, Oxford',
    lat: 51.7548, lng: -1.2544, price: 0, date: iso(4, 30, 18, 0),
    description: 'Free public lecture series — ticketed for capacity control, first come first served.',
  },
  {
    id: 'belfast-cultural-festival',
    title: 'Belfast Cultural Festival',
    category: 'Cultural Events',
    categoryGroup: 'Community & Culture',
    location: 'Titanic Quarter, Belfast',
    lat: 54.6079, lng: -5.9107, price: 25, date: iso(7, 19, 12, 0),
    description: 'Three stages, twenty acts and a dedicated family zone across a single waterfront day.',
  },
];

const ORGANISERS: UserProfile[] = [
  {
    uid: 'org-royal-live',
    email: 'events@royallive.co.uk',
    fullName: 'Amara Bennett',
    userType: 'organiser',
    status: 'approved',
    companyName: 'Royal Live Productions',
    website: 'https://royallive.example.com',
    bio: 'Stadium and arena promoters running large-scale music and sport events across the UK.',
    logoUrl: avatarSeed('royal-live'),
    coverUrl: eventImageSeed('royal-live-cover'),
    createdAt: iso(1, 4, 9, 0),
  },
  {
    uid: 'org-midlands-collective',
    email: 'hello@midlandscollective.co.uk',
    fullName: 'Idris Kaur',
    userType: 'organiser',
    status: 'approved',
    companyName: 'Midlands Event Collective',
    website: 'https://midlands.example.com',
    bio: 'Birmingham-based collective specialising in conferences, networking and cultural programming.',
    logoUrl: avatarSeed('midlands'),
    coverUrl: eventImageSeed('midlands-cover'),
    createdAt: iso(1, 9, 9, 0),
  },
  {
    uid: 'org-northern-nights',
    email: 'team@northernnights.co.uk',
    fullName: 'Sofia Lindqvist',
    userType: 'organiser',
    status: 'pending',
    companyName: 'Northern Nights',
    bio: 'Independent club and warehouse promoters operating across the north of England.',
    logoUrl: avatarSeed('northern-nights'),
    coverUrl: eventImageSeed('northern-cover'),
    createdAt: iso(2, 2, 9, 0),
  },
];

function organiserFor(index: number): UserProfile {
  return ORGANISERS[index % 2];
}

export const DEMO_EVENTS: Event[] = SEEDS.map((seed, index) => {
  const organiser = organiserFor(index);
  const eventType = seed.eventType ?? 'physical';
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    category: seed.category,
    categoryGroup: seed.categoryGroup,
    imageUrl: eventImageSeed(seed.id),
    date: seed.date,
    eventType,
    location: seed.location,
    country: 'United Kingdom',
    coordinates: eventType === 'physical' ? { lat: seed.lat, lng: seed.lng } : undefined,
    onlineLink: eventType === 'online' ? 'https://meet.example.com/tr-session' : undefined,
    streamDetails:
      eventType === 'livestream'
        ? { streamUrl: 'https://stream.example.com/tr-live', chatEnabled: true }
        : undefined,
    price: seed.price,
    currency: 'GBP',
    ticketTiers: seed.price === 0
      ? [{ id: 'general', name: 'Free Entry', price: 0, quantity: 500, sold: 0 }]
      : [
          {
            id: 'early-bird',
            name: 'Early Bird',
            description: 'Limited allocation, released first.',
            price: Math.round(seed.price * 0.8),
            quantity: 100,
            sold: 42,
          },
          {
            id: 'general',
            name: 'General Admission',
            price: seed.price,
            quantity: 800,
            sold: 210,
          },
          {
            id: 'vip',
            name: 'VIP & Hospitality',
            description: 'Lounge access, priority entry and complimentary drinks.',
            price: Math.round(seed.price * 2.5),
            quantity: 120,
            sold: 31,
          },
        ],
    capacity: 1020,
    organizerId: organiser.uid,
    organizerName: organiser.companyName ?? organiser.fullName,
    organizerLogoUrl: organiser.logoUrl,
    speakers:
      seed.categoryGroup === 'Business & Professional'
        ? [
            { name: 'Dr Naomi Clarke', title: 'Head of Applied ML, Deepline', photoUrl: avatarSeed('naomi') },
            { name: 'Tomás Herrera', title: 'Principal Engineer, Northwind', photoUrl: avatarSeed('tomas') },
            { name: 'Priya Raman', title: 'Founder, Vector Labs', photoUrl: avatarSeed('priya') },
          ]
        : undefined,
    featured: seed.featured ?? false,
    status: 'published',
    createdAt: iso(1, 15, 9, 0),
  };
});

export const DEMO_ORGANISERS = ORGANISERS;

export const DEMO_TICKETS: Ticket[] = [
  {
    id: 'demo-ticket-1',
    reference: 'TR-4KJ9-2QD7',
    eventId: 'birmingham-jazz-sessions',
    eventTitle: 'Birmingham Jazz Sessions',
    eventDate: iso(4, 18, 20, 0),
    eventLocation: 'Symphony Hall, Birmingham',
    organizerId: 'org-midlands-collective',
    organizerName: 'Midlands Event Collective',
    userId: 'demo-customer',
    attendeeName: 'Jordan Miles',
    attendeeEmail: 'customer@ticketroyality.com',
    tierId: 'vip',
    tierName: 'VIP & Hospitality',
    seat: 'B12',
    price: 80,
    currency: 'GBP',
    status: 'valid',
    purchasedAt: iso(2, 1, 12, 0),
    paymentProvider: 'stripe',
  },
  {
    id: 'demo-ticket-2',
    reference: 'TR-8MP3-7XZ1',
    eventId: 'birmingham-networking',
    eventTitle: 'Birmingham Founders Networking',
    eventDate: iso(3, 5, 18, 30),
    eventLocation: 'The Custard Factory, Birmingham',
    organizerId: 'org-midlands-collective',
    organizerName: 'Midlands Event Collective',
    userId: 'demo-customer',
    attendeeName: 'Jordan Miles',
    attendeeEmail: 'customer@ticketroyality.com',
    tierId: 'general',
    tierName: 'General Admission',
    price: 18,
    currency: 'GBP',
    status: 'valid',
    purchasedAt: iso(2, 3, 9, 0),
    paymentProvider: 'stripe',
  },
];
