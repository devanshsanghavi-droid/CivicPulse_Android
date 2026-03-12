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
import { TEST_ACCOUNT_EMAIL } from '../constants';

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

  // Listen to Firebase auth state (same as web)
  // Skip unverified email users — they must verify before being let in.
  // Google's OAuth flow guarantees emailVerified=true; this guard is for password provider only.
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === 'password');
        const isTestAccount = firebaseUser.email?.toLowerCase() === TEST_ACCOUNT_EMAIL;
        if (isEmailProvider && !firebaseUser.emailVerified && !isTestAccount) {
          // Don't set user or isAuthLoading — the sign-out that follows will
          // fire another onAuthStateChanged(null) which settles the state.
          setUserState(null);
          return;
        }
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

  // Poll notifications every 10 seconds (same pattern as web's 5s interval)
  useEffect(() => {
    if (!user) return;
    refreshNotifs();
    const interval = setInterval(refreshNotifs, 10000);
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
      isDark,
      toggleDarkMode,
      theme,
    }}>
      {children}
    </AppContext.Provider>
  );
};
