import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from '@/shared/firebase/client';
import { FirestorePermissionError } from '@/shared/errors';
import type {
  Coupon,
  Event,
  LedgerEntry,
  OfflinePayment,
  Ticket,
  UserProfile,
} from '@/shared/types';
import { DEMO_EVENTS, DEMO_ORGANISERS, DEMO_TICKETS } from './seed';
import { WELCOME_BONUS_ACU } from '@/shared/constants/billing';
import { generateTicketReference } from '@/shared/utils';

/**
 * Data access layer.
 *
 * Isomorphic on purpose — no `'use client'` directive — so server components
 * (event pages, organiser pages) and client components can share the same functions.
 *
 * Every read falls back to the demo dataset when Firebase is not configured, so the
 * platform is fully explorable before any backend is wired up. Every write surfaces
 * a `FirestorePermissionError` with full context on a rules rejection.
 */

const COLLECTIONS = {
  users: 'users',
  events: 'events',
  tickets: 'tickets',
  coupons: 'coupons',
  offlinePayments: 'offline_payments',
  ledger: 'wallet_ledger',
} as const;

function fromSnapshot<T>(snapshot: QueryDocumentSnapshot<DocumentData>): T {
  return { id: snapshot.id, ...snapshot.data() } as T;
}

function rethrowAsPermissionError(
  error: unknown,
  context: {
    path: string;
    operation: 'get' | 'list' | 'create' | 'update' | 'delete';
    requestResourceData?: unknown;
  }
): never {
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied') {
    throw new FirestorePermissionError(context);
  }
  throw error;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export async function getEvents(options?: { featuredOnly?: boolean; max?: number }): Promise<Event[]> {
  if (!isFirebaseConfigured) {
    let events = [...DEMO_EVENTS];
    if (options?.featuredOnly) events = events.filter((e) => e.featured);
    events.sort((a, b) => a.date.localeCompare(b.date));
    return options?.max ? events.slice(0, options.max) : events;
  }

  try {
    const constraints = [
      where('status', '==', 'published'),
      ...(options?.featuredOnly ? [where('featured', '==', true)] : []),
      orderBy('date', 'asc'),
      ...(options?.max ? [fsLimit(options.max)] : []),
    ];
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.events), ...constraints));
    return snapshot.docs.map((d) => fromSnapshot<Event>(d));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.events, operation: 'list' });
  }
}

export async function getEventById(id: string): Promise<Event | null> {
  if (!isFirebaseConfigured) {
    return DEMO_EVENTS.find((e) => e.id === id) ?? null;
  }
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.events, id));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Event) : null;
  } catch (error) {
    rethrowAsPermissionError(error, { path: `${COLLECTIONS.events}/${id}`, operation: 'get' });
  }
}

export async function getEventsByOrganizer(organizerId: string): Promise<Event[]> {
  if (!isFirebaseConfigured) {
    return DEMO_EVENTS.filter((e) => e.organizerId === organizerId);
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.events), where('organizerId', '==', organizerId))
    );
    return snapshot.docs
      .map((d) => fromSnapshot<Event>(d))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.events, operation: 'list' });
  }
}

export async function createEvent(payload: Omit<Event, 'id' | 'createdAt'>): Promise<string> {
  const data = { ...payload, createdAt: new Date().toISOString(), updatedAt: serverTimestamp() };
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.events), data);
    return ref.id;
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: COLLECTIONS.events,
      operation: 'create',
      requestResourceData: data,
    });
  }
}

export async function updateEvent(id: string, payload: Partial<Event>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.events, id), { ...payload, updatedAt: serverTimestamp() });
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: `${COLLECTIONS.events}/${id}`,
      operation: 'update',
      requestResourceData: payload,
    });
  }
}

export async function deleteEvent(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.events, id));
  } catch (error) {
    rethrowAsPermissionError(error, { path: `${COLLECTIONS.events}/${id}`, operation: 'delete' });
  }
}

/* -------------------------------------------------------------------------- */
/* Users & organisers                                                         */
/* -------------------------------------------------------------------------- */

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured) {
    return DEMO_ORGANISERS.find((o) => o.uid === uid) ?? null;
  }
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.users, uid));
    return snapshot.exists() ? ({ uid: snapshot.id, ...snapshot.data() } as UserProfile) : null;
  } catch (error) {
    rethrowAsPermissionError(error, { path: `${COLLECTIONS.users}/${uid}`, operation: 'get' });
  }
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const data: UserProfile = {
    ...profile,
    // Every new account is minted with the one-time $1 welcome credit.
    wallet: profile.wallet ?? {
      balanceAcu: WELCOME_BONUS_ACU,
      lifetimeGrantedAcu: WELCOME_BONUS_ACU,
      lifetimePurchasedAcu: 0,
      lifetimeSpentAcu: 0,
      lastUpdatedAt: new Date().toISOString(),
    },
    welcomeBonusGranted: true,
  };
  try {
    await setDoc(doc(db, COLLECTIONS.users, profile.uid), data);
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: `${COLLECTIONS.users}/${profile.uid}`,
      operation: 'create',
      requestResourceData: data,
    });
  }
}

export async function updateUserProfile(uid: string, payload: Partial<UserProfile>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), payload as DocumentData);
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: `${COLLECTIONS.users}/${uid}`,
      operation: 'update',
      requestResourceData: payload,
    });
  }
}

export async function getOrganisers(status?: UserProfile['status']): Promise<UserProfile[]> {
  if (!isFirebaseConfigured) {
    return status ? DEMO_ORGANISERS.filter((o) => o.status === status) : DEMO_ORGANISERS;
  }
  try {
    const constraints = [
      where('userType', '==', 'organiser'),
      ...(status ? [where('status', '==', status)] : []),
    ];
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.users), ...constraints));
    return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.users, operation: 'list' });
  }
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured) {
    return DEMO_ORGANISERS.find((o) => o.email === email) ?? null;
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.users), where('email', '==', email), fsLimit(1))
    );
    const first = snapshot.docs[0];
    return first ? ({ uid: first.id, ...first.data() } as UserProfile) : null;
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.users, operation: 'list' });
  }
}

/* -------------------------------------------------------------------------- */
/* Tickets                                                                    */
/* -------------------------------------------------------------------------- */

export async function getUserTickets(userId: string): Promise<Ticket[]> {
  if (!isFirebaseConfigured) {
    return DEMO_TICKETS;
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.tickets), where('userId', '==', userId))
    );
    return snapshot.docs
      .map((d) => fromSnapshot<Ticket>(d))
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.tickets, operation: 'list' });
  }
}

export async function getTicketsForOrganizer(organizerId: string): Promise<Ticket[]> {
  if (!isFirebaseConfigured) {
    return DEMO_TICKETS;
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.tickets), where('organizerId', '==', organizerId))
    );
    return snapshot.docs
      .map((d) => fromSnapshot<Ticket>(d))
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.tickets, operation: 'list' });
  }
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  if (!isFirebaseConfigured) {
    return DEMO_TICKETS.find((t) => t.id === id) ?? null;
  }
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.tickets, id));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Ticket) : null;
  } catch (error) {
    rethrowAsPermissionError(error, { path: `${COLLECTIONS.tickets}/${id}`, operation: 'get' });
  }
}

export async function createTicket(
  payload: Omit<Ticket, 'id' | 'reference' | 'purchasedAt' | 'status'>
): Promise<Ticket> {
  const data = {
    ...payload,
    reference: generateTicketReference(),
    status: 'valid' as const,
    purchasedAt: new Date().toISOString(),
  };
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.tickets), data);
    return { id: ref.id, ...data };
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: COLLECTIONS.tickets,
      operation: 'create',
      requestResourceData: data,
    });
  }
}

/**
 * Marks a ticket as used. Returns the validation outcome the door scanner renders.
 * A ticket is only accepted for the event it was issued for, and only once.
 */
export async function redeemTicket(
  ticketId: string,
  eventId: string
): Promise<{ result: 'valid' | 'already-used' | 'wrong-event' | 'invalid'; ticket?: Ticket }> {
  const ticket = await getTicketById(ticketId);

  if (!ticket) return { result: 'invalid' };
  if (ticket.eventId !== eventId) return { result: 'wrong-event', ticket };
  if (ticket.status === 'redeemed') return { result: 'already-used', ticket };
  if (ticket.status !== 'valid') return { result: 'invalid', ticket };

  const redeemedAt = new Date().toISOString();
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, COLLECTIONS.tickets, ticketId), { status: 'redeemed', redeemedAt });
    } catch (error) {
      rethrowAsPermissionError(error, {
        path: `${COLLECTIONS.tickets}/${ticketId}`,
        operation: 'update',
        requestResourceData: { status: 'redeemed', redeemedAt },
      });
    }
  }
  return { result: 'valid', ticket: { ...ticket, status: 'redeemed', redeemedAt } };
}

/* -------------------------------------------------------------------------- */
/* Coupons                                                                    */
/* -------------------------------------------------------------------------- */

export async function getCouponsForOrganizer(organizerId: string): Promise<Coupon[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.coupons), where('organizerId', '==', organizerId))
    );
    return snapshot.docs.map((d) => fromSnapshot<Coupon>(d));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.coupons, operation: 'list' });
  }
}

export async function createCoupon(payload: Omit<Coupon, 'id' | 'usageCount'>): Promise<string> {
  const data = { ...payload, usageCount: 0 };
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.coupons), data);
    return ref.id;
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: COLLECTIONS.coupons,
      operation: 'create',
      requestResourceData: data,
    });
  }
}

export async function findCouponByCode(code: string): Promise<Coupon | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.coupons), where('code', '==', code.toUpperCase()), fsLimit(1))
    );
    const first = snapshot.docs[0];
    return first ? fromSnapshot<Coupon>(first) : null;
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.coupons, operation: 'list' });
  }
}

/* -------------------------------------------------------------------------- */
/* Offline (mobile money) payments                                            */
/* -------------------------------------------------------------------------- */

export async function createOfflinePayment(
  payload: Omit<OfflinePayment, 'id' | 'status' | 'createdAt'>
): Promise<string> {
  const data = { ...payload, status: 'pending' as const, createdAt: new Date().toISOString() };
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.offlinePayments), data);
    return ref.id;
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: COLLECTIONS.offlinePayments,
      operation: 'create',
      requestResourceData: data,
    });
  }
}

export async function getPendingOfflinePayments(): Promise<OfflinePayment[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.offlinePayments), where('status', '==', 'pending'))
    );
    return snapshot.docs.map((d) => fromSnapshot<OfflinePayment>(d));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.offlinePayments, operation: 'list' });
  }
}

export async function updateOfflinePaymentStatus(
  id: string,
  status: 'approved' | 'denied',
  reviewedBy: string
): Promise<void> {
  const payload = { status, reviewedBy, reviewedAt: new Date().toISOString() };
  try {
    await updateDoc(doc(db, COLLECTIONS.offlinePayments, id), payload);
  } catch (error) {
    rethrowAsPermissionError(error, {
      path: `${COLLECTIONS.offlinePayments}/${id}`,
      operation: 'update',
      requestResourceData: payload,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* ACU wallet ledger (read-only from the client — writes happen server-side)   */
/* -------------------------------------------------------------------------- */

export async function getLedgerEntries(uid: string): Promise<LedgerEntry[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.ledger), where('uid', '==', uid), fsLimit(50))
    );
    return snapshot.docs
      .map((d) => fromSnapshot<LedgerEntry>(d))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    rethrowAsPermissionError(error, { path: COLLECTIONS.ledger, operation: 'list' });
  }
}

export async function getPlatformStats(): Promise<{
  totalUsers: number;
  totalEvents: number;
  totalTickets: number;
}> {
  if (!isFirebaseConfigured) {
    return {
      totalUsers: DEMO_ORGANISERS.length,
      totalEvents: DEMO_EVENTS.length,
      totalTickets: DEMO_TICKETS.length,
    };
  }
  try {
    const [users, events, tickets] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.users)),
      getDocs(collection(db, COLLECTIONS.events)),
      getDocs(collection(db, COLLECTIONS.tickets)),
    ]);
    return { totalUsers: users.size, totalEvents: events.size, totalTickets: tickets.size };
  } catch (error) {
    rethrowAsPermissionError(error, { path: 'platform-stats', operation: 'list' });
  }
}
