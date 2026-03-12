// src/services/firebaseAuth.ts
// KEY DIFFERENCE from web: Uses @react-native-google-signin/google-signin
// instead of signInWithPopup. Everything else is the same.

import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";
import {
  GoogleSignin,
  statusCodes
} from "@react-native-google-signin/google-signin";
import { auth } from "./firebaseConfig";
import { firestoreService } from "./firestoreService";
import { storageService } from "./storage";
import { User } from "../types";
import { SUPER_ADMIN_EMAILS, TEST_ACCOUNT_EMAIL } from "../constants";

// Call this once at app startup (in App.tsx)
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    // Get this from your GoogleService-Info.plist (iOS CLIENT_ID field)
    iosClientId: "309051340001-svhkv0f9cfi724g1nckjale3068h3gvo.apps.googleusercontent.com",
    // Get this from Firebase Console > Project Settings > General > Web API Key
    webClientId: "309051340001-mfsia99tgd5o5j2mfsbbhio5illetnr6.apps.googleusercontent.com",
  });
};

/**
 * Sign in with Google - React Native version
 * Replaces the web's signInWithPopup approach
 */
export const signInWithGoogle = async (): Promise<User> => {
  try {
    // Check if Google Play Services are available (Android) or sign-in is supported
    await GoogleSignin.hasPlayServices();

    // Trigger the native Google Sign-In UI
    const response = await GoogleSignin.signIn();
    const { idToken } = response.data ?? {};

    if (!idToken) {
      throw new Error("Failed to get ID token from Google Sign-In");
    }

    // Create Firebase credential from the Google token
    const googleCredential = GoogleAuthProvider.credential(idToken);

    // Sign into Firebase with that credential
    const result = await signInWithCredential(auth, googleCredential);
    const firebaseUser = result.user;

    const email = firebaseUser.email || '';
    const name = firebaseUser.displayName || email.split('@')[0] || 'User';
    const photoURL = firebaseUser.photoURL || '';
    const now = new Date().toISOString();

    // Determine role
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    const role = isSuperAdmin ? 'super_admin' : 'resident';

    // Create or update user in local storage
    const user = await storageService.upsertUser({
      id: firebaseUser.uid,
      name,
      email,
      role,
      photoURL,
      createdAt: now,
      lastLoginAt: now,
      notifsEnabled: true,
    });

    // Log login + upsert user record in Firestore (same as web)
    try {
      await firestoreService.logLogin({
        userId: user.id,
        email,
        name,
        photoURL,
        loginAt: now,
        userAgent: 'CivicPulse iOS App'
      });
    } catch (e) {
      console.warn('Failed to log login event:', e);
    }

    try {
      await firestoreService.upsertUserRecord({
        id: user.id,
        email,
        name,
        photoURL,
        role: user.role,
        banType: 'none',
        createdAt: now,
        lastLoginAt: now
      });
    } catch (e) {
      console.warn('Failed to upsert user record:', e);
    }

    return user;
  } catch (error: any) {
    // Provide helpful error messages for common cases
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error("Sign-in was cancelled.");
    } else if (error.code === statusCodes.IN_PROGRESS) {
      throw new Error("Sign-in is already in progress.");
    } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error("Google Play Services not available.");
    }
    console.error("Google Sign-In error:", error);
    throw new Error(error.message || "Failed to sign in with Google");
  }
};

/**
 * Sign up with email and password.
 * Sends a verification email and signs the user out — they must verify
 * before they can sign in. Test account bypasses verification.
 * Returns User if immediately signed in (test account), null if verification needed.
 */
export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User | null> => {
  const isTestAccount = email.toLowerCase() === TEST_ACCOUNT_EMAIL;
  let firebaseUser: FirebaseUser | null = null;
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = result.user;

    await updateProfile(firebaseUser, { displayName });

    // Test account skips verification — sign in immediately
    if (isTestAccount) {
      const now = new Date().toISOString();
      const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
      const role = isSuperAdmin ? 'super_admin' : 'resident';
      return await storageService.upsertUser({
        id: firebaseUser.uid, name: displayName, email, role,
        photoURL: '', createdAt: now, lastLoginAt: now, notifsEnabled: true,
      });
    }

    await sendEmailVerification(firebaseUser);
    await signOut(auth);
    return null;
  } catch (error: any) {
    if (firebaseUser && !isTestAccount) {
      try { await firebaseUser.delete(); } catch { /* ignore */ }
      try { await signOut(auth); } catch { /* ignore */ }
    }
    switch (error.code) {
      case 'auth/email-already-in-use': throw new Error('An account with this email already exists.');
      case 'auth/invalid-email': throw new Error('Please enter a valid email address.');
      case 'auth/weak-password': throw new Error('Password must be at least 6 characters.');
      case 'auth/operation-not-allowed': throw new Error('Email/password sign-up is not enabled. Please contact support.');
      case 'auth/too-many-requests': throw new Error('Too many attempts. Please try again later.');
      default: throw new Error(error.message || 'Failed to create account. Please try again.');
    }
  }
};

/**
 * Sign in with email and password.
 * Rejects unverified accounts — signs them out and throws.
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

    // Block unverified email accounts (test account bypasses)
    const isTestAccount = email.toLowerCase() === TEST_ACCOUNT_EMAIL;
    if (!firebaseUser.emailVerified && !isTestAccount) {
      try { await signOut(auth); } catch { /* AppContext guard is the fallback */ }
      const err = new Error('Please verify your email before signing in. Check your inbox for a verification link.') as any;
      err.code = 'auth/email-not-verified';
      throw err;
    }

    const name = firebaseUser.displayName || email.split('@')[0] || 'User';
    const photoURL = firebaseUser.photoURL || '';
    const now = new Date().toISOString();
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    const role = isSuperAdmin ? 'super_admin' : 'resident';

    const user = await storageService.upsertUser({
      id: firebaseUser.uid,
      name,
      email,
      role,
      photoURL,
      createdAt: now,
      lastLoginAt: now,
      notifsEnabled: true,
    });

    try {
      await firestoreService.logLogin({ userId: user.id, email, name, photoURL, loginAt: now, userAgent: 'CivicPulse iOS App' });
    } catch (e) { console.warn('Failed to log login event:', e); }

    try {
      await firestoreService.upsertUserRecord({ id: user.id, email, name, photoURL, role: user.role, banType: 'none', createdAt: now, lastLoginAt: now });
    } catch (e) { console.warn('Failed to upsert user record:', e); }

    return user;
  } catch (error: any) {
    switch (error.code) {
      case 'auth/email-not-verified': throw new Error('Please verify your email before signing in. Check your inbox for a verification link.');
      case 'auth/user-not-found': throw new Error('No account found with this email.');
      case 'auth/wrong-password':
      case 'auth/invalid-credential': throw new Error('Incorrect password. Please try again.');
      case 'auth/invalid-email': throw new Error('Please enter a valid email address.');
      case 'auth/too-many-requests': throw new Error('Too many attempts. Please try again later.');
      case 'auth/user-disabled': throw new Error('This account has been disabled. Please contact support.');
      case 'auth/operation-not-allowed': throw new Error('Email/password sign-in is not enabled. Please contact support.');
      default: throw new Error(error.message || 'Something went wrong. Please try again.');
    }
  }
};

/**
 * Sign out from Firebase and Google
 */
export const signOutUser = async (): Promise<void> => {
  // Revoke Google access token (best-effort — token may already be expired or
  // the user may have signed in via email, so ignore failures here)
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // token_not_revocable / no active Google session — safe to ignore
  }

  // These must succeed for the user to actually be signed out
  try {
    await GoogleSignin.signOut();
  } catch {
    // No active Google session — safe to ignore
  }

  await signOut(auth);
  await storageService.clearCurrentUser();
};

/**
 * Listen to Firebase auth state changes - identical to web
 */
export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Convert Firebase user to app User type
 * Called when auth state changes (e.g. app reopen)
 */
export const convertFirebaseUserToAppUser = async (
  firebaseUser: FirebaseUser | null
): Promise<User | null> => {
  if (!firebaseUser) return null;

  const email = firebaseUser.email || '';
  const name = firebaseUser.displayName || email.split('@')[0] || 'User';
  const photoURL = firebaseUser.photoURL || '';

  // Check if user exists in local storage first
  const existingUser = await storageService.getCurrentUser();
  if (existingUser && existingUser.email === email) {
    // Update photo and name if changed
    return await storageService.upsertUser({ ...existingUser, photoURL, name });
  }

  // Otherwise create from Firebase data
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
  return await storageService.upsertUser({
    id: firebaseUser.uid,
    name,
    email,
    role: isSuperAdmin ? 'super_admin' : 'resident',
    photoURL,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    notifsEnabled: true,
  });
};
