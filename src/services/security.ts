// src/services/security.ts
// Client-side security: rate limiting, input sanitization, ban checks, duplicate prevention

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

// --- Custom error classes for reliable error identification ---

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class RateLimitError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class BanError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'BanError';
  }
}

export class DuplicateError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateError';
  }
}

// --- Content length limits ---

export const LIMITS = {
  ISSUE_TITLE: 80,
  ISSUE_DESCRIPTION: 2000,
  COMMENT_BODY: 1000,
  USER_NAME: 50,
  ADDRESS_QUERY: 200,
  BAN_REASON: 500,
  SEARCH_QUERY: 100,
  STATUS_NOTE: 500,
  REPORT_REASON: 500,
  RESOLUTION_REASON: 500,
  EMAIL: 100,
  PASSWORD: 128,
  BAN_DURATION: 5,
  PHOTO_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

// --- Rate Limiting (AsyncStorage-backed) ---

const RATE_LIMIT_PREFIX = 'ratelimit_';

export const RATE_LIMITS = {
  createIssue:      { max: 5,  windowMs: 60 * 60 * 1000 },      // 5 per hour
  addComment:       { max: 20, windowMs: 60 * 60 * 1000 },      // 20 per hour
  toggleUpvote:     { max: 60, windowMs: 60 * 60 * 1000 },      // 60 per hour
  submitSuggestion: { max: 10, windowMs: 60 * 60 * 1000 },      // 10 per hour
  submitReport:     { max: 10, windowMs: 60 * 60 * 1000 },      // 10 per hour
  addressSearch:    { max: 10, windowMs: 60 * 1000 },            // 10 per minute
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export async function checkRateLimit(action: RateLimitAction, userId: string): Promise<void> {
  const { max, windowMs } = RATE_LIMITS[action];
  const key = `${RATE_LIMIT_PREFIX}${action}_${userId}`;
  const now = Date.now();

  try {
    const raw = await AsyncStorage.getItem(key);
    let timestamps: number[] = raw ? JSON.parse(raw) : [];

    // Prune expired entries
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= max) {
      const waitMs = windowMs - (now - timestamps[0]);
      const waitMin = Math.ceil(waitMs / 60000);
      throw new RateLimitError(`Too many requests. Please wait ${waitMin} minute${waitMin !== 1 ? 's' : ''} before trying again.`);
    }

    timestamps.push(now);
    await AsyncStorage.setItem(key, JSON.stringify(timestamps));
  } catch (err: any) {
    if (err instanceof RateLimitError) throw err;
    // Swallow AsyncStorage errors — fail open rather than blocking the user
  }
}

// --- Input Sanitization ---

export function sanitizeText(input: string, maxLength: number): string {
  let text = input.trim();

  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Remove null bytes and control characters (keep \n and \t)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Truncate to max length
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
  }

  return text;
}

// --- Ban Check (with in-memory cache) ---

interface BanCacheEntry {
  banned: boolean;
  reason?: string;
  checkedAt: number;
}

const banCache = new Map<string, BanCacheEntry>();
const BAN_CACHE_TTL = 60 * 1000; // 60 seconds

export async function checkBanned(userId: string): Promise<void> {
  const now = Date.now();
  const cached = banCache.get(userId);

  if (cached && now - cached.checkedAt < BAN_CACHE_TTL) {
    if (cached.banned) {
      throw new BanError(cached.reason || 'Your account has been suspended.');
    }
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return;

    const data = snap.data();
    const banType = data.banType as string;

    if (banType === 'permanent') {
      const reason = data.banReason
        ? `Your account has been permanently suspended. Reason: ${data.banReason}`
        : 'Your account has been permanently suspended.';
      banCache.set(userId, { banned: true, reason, checkedAt: now });
      throw new BanError(reason);
    }

    if (banType === 'temporary') {
      // bannedUntil may be a Firestore Timestamp or an ISO string
      const raw = data.bannedUntil;
      const bannedUntil = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
      if (bannedUntil && !isNaN(bannedUntil.getTime()) && bannedUntil > new Date()) {
        const reason = data.banReason
          ? `Your account is suspended until ${bannedUntil.toLocaleDateString()}. Reason: ${data.banReason}`
          : `Your account is suspended until ${bannedUntil.toLocaleDateString()}.`;
        banCache.set(userId, { banned: true, reason, checkedAt: now });
        throw new BanError(reason);
      }
    }

    banCache.set(userId, { banned: false, checkedAt: now });
  } catch (err: any) {
    if (err instanceof BanError) throw err;
    // Swallow Firestore errors — fail open rather than blocking non-banned users
  }
}

// Clear ban cache (call when user data changes, e.g. after unban)
export function clearBanCache(userId?: string) {
  if (userId) {
    banCache.delete(userId);
  } else {
    banCache.clear();
  }
}

// --- Duplicate Submission Guard ---

const recentSubmissions = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 30 * 1000; // 30 seconds

export function checkDuplicate(userId: string, ...fields: string[]): void {
  // Use null byte separator to avoid hash collisions
  const hash = [userId, ...fields].join('\0');
  const now = Date.now();

  // Clean old entries
  for (const [key, timestamp] of recentSubmissions) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) {
      recentSubmissions.delete(key);
    }
  }

  if (recentSubmissions.has(hash)) {
    throw new DuplicateError('Duplicate submission detected. Please wait a moment before trying again.');
  }

  recentSubmissions.set(hash, now);
}

// --- Photo Validation ---

export function validatePhotoUri(uri: string): void {
  // Expo image picker and camera URIs are always safe — skip validation
  // These come from the device's own image picker, not user-typed input
  const lower = uri.toLowerCase();
  if (
    lower.startsWith('file://') ||
    lower.startsWith('data:') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('assets-library://') ||
    lower.includes('imagepicker') ||
    lower.includes('camera') ||
    lower.includes('expo')
  ) {
    return;
  }

  const validExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
  const hasValidExt = validExtensions.some(ext => lower.endsWith(ext));
  if (!hasValidExt) {
    throw new SecurityError('Invalid photo format. Please use JPG, PNG, or HEIC images.');
  }
}

export async function validatePhotoBlob(blob: Blob): Promise<void> {
  if (blob.size > LIMITS.PHOTO_MAX_SIZE_BYTES) {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    throw new SecurityError(`Photo is too large (${sizeMB}MB). Maximum size is 10MB.`);
  }

  if (blob.type && !blob.type.startsWith('image/')) {
    throw new SecurityError('Invalid file type. Only images are allowed.');
  }
}
