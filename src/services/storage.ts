// src/services/storage.ts
// Replaces mockApi's localStorage calls with AsyncStorage (React Native compatible)
// AsyncStorage is async, so all methods return Promises.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Issue, Comment, Upvote, Notification, IssueStatus } from '../types';
import { CATEGORIES, TRENDING_WEIGHT_UPVOTES, TRENDING_RECENCY_DAYS } from '../constants';

const KEYS = {
  CURRENT_USER: 'civicpulse_auth',
  USERS: 'civicpulse_users',
  UPVOTES: 'civicpulse_upvotes',
  NOTIFS: 'civicpulse_notifs',
};

// Helper to get JSON from AsyncStorage
const getStored = async <T>(key: string, defaultValue: T): Promise<T> => {
  try {
    const item = await AsyncStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Helper to set JSON in AsyncStorage
const setStored = async <T>(key: string, value: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('AsyncStorage write error:', e);
  }
};

export const calculateTrendingScore = (issue: Issue) => {
  const daysSince = (Date.now() - new Date(issue.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return issue.upvoteCount * TRENDING_WEIGHT_UPVOTES + Math.max(0, TRENDING_RECENCY_DAYS - daysSince);
};

/** Haversine distance between two lat/lng points, in miles */
export const distanceMiles = (
  lat1: number, lon1: number, lat2: number, lon2: number
): number => {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Trending score weighted by distance.
 * - Within 5 mi: full score
 * - 5–25 mi: linear decay to 30% of score
 * - 25–50 mi: linear decay to 5% of score
 * - Beyond 50 mi: 2% of score (nearly invisible)
 */
export const calculateTrendingScoreWithDistance = (
  issue: Issue,
  userLat: number,
  userLon: number
): number => {
  const base = calculateTrendingScore(issue);
  if (issue.latitude == null || issue.longitude == null) {
    return base * 0.1; // no location = low priority
  }
  const dist = distanceMiles(userLat, userLon, issue.latitude, issue.longitude);
  let multiplier: number;
  if (dist <= 5) multiplier = 1.0;
  else if (dist <= 25) multiplier = 1.0 - 0.7 * ((dist - 5) / 20);   // 1.0 → 0.3
  else if (dist <= 50) multiplier = 0.3 - 0.25 * ((dist - 25) / 25);  // 0.3 → 0.05
  else multiplier = 0.02;
  return base * multiplier;
};

export const storageService = {

  // --- User ---

  getCurrentUser: async (): Promise<User | null> => {
    return getStored<User | null>(KEYS.CURRENT_USER, null);
  },

  setCurrentUser: async (user: User): Promise<void> => {
    await setStored(KEYS.CURRENT_USER, user);
  },

  clearCurrentUser: async (): Promise<void> => {
    await AsyncStorage.removeItem(KEYS.CURRENT_USER);
  },

  upsertUser: async (userData: User): Promise<User> => {
    const users = await getStored<User[]>(KEYS.USERS, []);
    const idx = users.findIndex(u => u.id === userData.id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...userData };
    } else {
      users.push(userData);
    }
    await setStored(KEYS.USERS, users);
    await setStored(KEYS.CURRENT_USER, userData);
    return userData;
  },

  updateProfile: async (userId: string, data: Partial<User>): Promise<User | null> => {
    const users = await getStored<User[]>(KEYS.USERS, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...data };
    await setStored(KEYS.USERS, users);
    const currentUser = await getStored<User | null>(KEYS.CURRENT_USER, null);
    if (currentUser && currentUser.id === userId) {
      const updated = { ...currentUser, ...data };
      await setStored(KEYS.CURRENT_USER, updated);
      return updated;
    }
    return users[idx];
  },

  // --- Upvotes ---

  hasUpvoted: async (issueId: string, userId: string): Promise<boolean> => {
    const upvotes = await getStored<Upvote[]>(KEYS.UPVOTES, []);
    return upvotes.some(u => u.issueId === issueId && u.userId === userId);
  },

  toggleUpvote: async (issueId: string, userId: string): Promise<'added' | 'removed'> => {
    const upvotes = await getStored<Upvote[]>(KEYS.UPVOTES, []);
    const existing = upvotes.find(u => u.issueId === issueId && u.userId === userId);
    if (existing) {
      const filtered = upvotes.filter(u => !(u.issueId === issueId && u.userId === userId));
      await setStored(KEYS.UPVOTES, filtered);
      return 'removed';
    } else {
      upvotes.push({
        id: Math.random().toString(36).substr(2, 9),
        issueId,
        userId
      });
      await setStored(KEYS.UPVOTES, upvotes);
      return 'added';
    }
  },

  // --- Notifications (local cache) ---
  // NOTE: Notifications are primarily managed in Firestore.
  // This local cache is used for offline/fast access.

  getNotifications: async (userId: string): Promise<Notification[]> => {
    const notifs = await getStored<Notification[]>(KEYS.NOTIFS, []);
    return notifs
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  setNotifications: async (notifs: Notification[]): Promise<void> => {
    await setStored(KEYS.NOTIFS, notifs);
  },

  markNotificationsRead: async (userId: string): Promise<void> => {
    const notifs = await getStored<Notification[]>(KEYS.NOTIFS, []);
    const updated = notifs.map(n => n.userId === userId ? { ...n, read: true } : n);
    await setStored(KEYS.NOTIFS, updated);
  },

  addNotification: async (
    userId: string,
    title: string,
    message: string,
    type: Notification['type'],
    issueId: string
  ): Promise<void> => {
    const notifs = await getStored<Notification[]>(KEYS.NOTIFS, []);
    notifs.push({
      id: Math.random().toString(36).substr(2, 9),
      userId,
      title,
      message,
      type,
      issueId,
      read: false,
      createdAt: new Date().toISOString()
    });
    await setStored(KEYS.NOTIFS, notifs);
  },

  // --- Clear all (for logout) ---
  clearAll: async (): Promise<void> => {
    await AsyncStorage.multiRemove([
      KEYS.CURRENT_USER,
      KEYS.UPVOTES,
      KEYS.NOTIFS,
    ]);
    // NOTE: We don't clear KEYS.USERS so the user record persists
    // for next sign-in. Only the session is cleared.
  }
};
