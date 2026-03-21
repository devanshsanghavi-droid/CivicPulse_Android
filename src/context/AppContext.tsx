// src/context/AppContext.tsx
// React Native version of your web App.tsx context logic.
// Navigation is handled by AppNavigator.tsx instead of screen state strings.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Notification } from '../types';
import { storageService } from '../services/storage';
import { firestoreService } from '../services/firestoreService';
import { onAuthStateChange, convertFirebaseUserToAppUser, configureGoogleSignIn } from '../services/firebaseAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, AppTheme } from '../constants/theme';
import { checkBanned, clearBanCache } from '../services/security';

interface AppContextType {
  user: User | null;
  setUser: (u: User | null) => Promise<void>;
  isAdmin: boolean;
  notifs: Notification[];
  unreadCount: number;
  refreshNotifs: () => Promise<void>;
  markNotifsRead: () => Promise<void>;
  locationExplained: boolean;
  setLocationExplained: (v: boolean) => void;
  isAuthLoading: boolean;
  isBanned: boolean;
  banMessage: string;
  isDark: boolean;
  toggleDarkMode: () => void;
  theme: AppTheme;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

const DARK_MODE_KEY = 'civicpulse_darkMode';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [locationExplained, setLocationExplained] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [banMessage, setBanMessage] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const unreadCount = notifs.filter(n => !n.read).length;
  const theme = isDark ? darkTheme : lightTheme;

  // Load dark mode preference on start
  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY).then(val => {
      if (val === 'true') setIsDark(true);
    }).catch(() => { });
  }, []);

  // Configure Google Sign-In once
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        const appUser = await convertFirebaseUserToAppUser(firebaseUser);
        setUserState(appUser);
      } else {
        setUserState(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setUser = async (u: User | null) => {
    setUserState(u);
    if (u) {
      await storageService.setCurrentUser(u);
    } else {
      setIsBanned(false);
      setBanMessage('');
      clearBanCache();
      await storageService.clearCurrentUser();
    }
  };

  const toggleDarkMode = () => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(DARK_MODE_KEY, next ? 'true' : 'false').catch(() => { });
      return next;
    });
  };

  const refreshNotifs = async () => {
    if (!user) return;
    try {
      // Fetch from Firestore (live data)
      const firestoreNotifs = await firestoreService.getNotifications(user.id);
      setNotifs(firestoreNotifs);
      // Cache locally
      await storageService.setNotifications(firestoreNotifs);
    } catch {
      // Fallback to local cache if Firestore fails
      const localNotifs = await storageService.getNotifications(user.id);
      setNotifs(localNotifs);
    }
  };

  const markNotifsRead = async () => {
    if (!user) return;
    await firestoreService.markNotificationsRead(user.id);
    await storageService.markNotificationsRead(user.id);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Check ban status (uses 60s cache — no need to clear cache on every poll)
  const checkBanStatus = async () => {
    if (!user) return;
    try {
      await checkBanned(user.id);
      setIsBanned(false);
      setBanMessage('');
    } catch (err: any) {
      setIsBanned(true);
      setBanMessage(err.message || 'Your account has been suspended.');
    }
  };

  // Sync role from Firestore (catches admin promotions/demotions in near real-time)
  const syncRole = async () => {
    if (!user) return;
    try {
      const userDoc = await firestoreService.getUserRecord(user.id);
      if (userDoc && userDoc.role !== user.role) {
        const updated = { ...user, role: userDoc.role };
        setUserState(updated);
        await storageService.setCurrentUser(updated);
      }
    } catch { /* silent — role sync is best-effort */ }
  };

  // Poll notifications, ban status, and role every 10 seconds
  useEffect(() => {
    if (!user) return;
    refreshNotifs();
    checkBanStatus();
    syncRole();
    const interval = setInterval(() => {
      refreshNotifs();
      checkBanStatus();
      syncRole();
    }, 10000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <AppContext.Provider value={{
      user,
      setUser,
      isAdmin,
      notifs,
      unreadCount,
      refreshNotifs,
      markNotifsRead,
      locationExplained,
      setLocationExplained,
      isAuthLoading,
      isBanned,
      banMessage,
      isDark,
      toggleDarkMode,
      theme,
    }}>
      {children}
    </AppContext.Provider>
  );
};
