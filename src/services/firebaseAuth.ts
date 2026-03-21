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
import { User, UserRole } from "../types";
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

    return await buildUserFromFirebase(firebaseUser, email);
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
 * Creates account and immediately signs in — no email verification required.
 */
export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  let firebaseUser: FirebaseUser | null = null;
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = result.user;
    await updateProfile(firebaseUser, { displayName });
    return await buildUserFromFirebase(firebaseUser, email);
  } catch (error: any) {
    if (firebaseUser) {
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
 * Test account auto-creates if it doesn't exist or has wrong password.
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const isTestAccount = email.toLowerCase() === TEST_ACCOUNT_EMAIL;

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return await buildUserFromFirebase(result.user, email);
  } catch (error: any) {
    // Test account: auto-create if not found, or recreate if wrong password
    if (isTestAccount && (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    )) {
      return await resetTestAccount(email, password);
    }

    switch (error.code) {
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

/** Shared helper: build app User from a Firebase user after successful auth */
const buildUserFromFirebase = async (firebaseUser: FirebaseUser, email: string): Promise<User> => {
  const name = firebaseUser.displayName || email.split('@')[0] || 'User';
  const photoURL = firebaseUser.photoURL || '';
  const now = new Date().toISOString();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());

  // Fetch existing record from Firestore (preserves admin promotions + ban state)
  let existingRecord: any = null;
  try {
    existingRecord = await firestoreService.getUserRecord(firebaseUser.uid);
  } catch { /* fall back to defaults */ }

  const firestoreRole: UserRole | null = existingRecord?.role || null;
  const role: UserRole = firestoreRole || (isSuperAdmin ? 'super_admin' : 'resident');

  const user = await storageService.upsertUser({
    id: firebaseUser.uid, name, email, role, photoURL,
    createdAt: now, lastLoginAt: now, notifsEnabled: true,
  });

  try {
    await firestoreService.logLogin({ userId: user.id, email, name, photoURL, loginAt: now, userAgent: 'CivicPulse iOS App' });
  } catch (e) { console.warn('Failed to log login event:', e); }

  try {
    // Only set banType on first creation — don't overwrite existing bans
    const record: any = { id: user.id, email, name, photoURL, role: user.role, lastLoginAt: now };
    if (!existingRecord) {
      record.banType = 'none';
      record.createdAt = now;
    }
    await firestoreService.upsertUserRecord(record);
  } catch (e) { console.warn('Failed to upsert user record:', e); }

  return user;
};

/** Delete and recreate the test account with the given password */
const resetTestAccount = async (email: string, password: string): Promise<User> => {
  // Try to delete the old account if we can sign into it with any means
  // If we can't, just create fresh — Firebase will tell us if email is taken
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;
    await updateProfile(firebaseUser, { displayName: 'Developer Tester' });
    return await buildUserFromFirebase(firebaseUser, email);
  } catch (createError: any) {
    if (createError.code === 'auth/email-already-in-use') {
      // Account exists with different password — can't auto-fix from client
      // The old account needs to be deleted from Firebase Console, or the user
      // needs to sign up fresh. Throw a clear message.
      throw new Error('Test account exists with a different password. Delete it from Firebase Console and try again.');
    }
    throw new Error(createError.message || 'Failed to initialize test account.');
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

  // Always fetch role from Firestore (catches admin promotions/demotions)
  let firestoreRole: UserRole | null = null;
  try {
    const { firestoreService } = require('./firestoreService');
    const userDoc = await firestoreService.getUserRecord(firebaseUser.uid);
    if (userDoc) firestoreRole = userDoc.role;
  } catch { /* Firestore unavailable — fall back to local/defaults */ }

  // Check if user exists in local storage
  const existingUser = await storageService.getCurrentUser();
  if (existingUser && existingUser.email === email) {
    // Priority: Firestore role > super admin email list > existing local role
    const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    const role: UserRole = firestoreRole || (shouldBeSuperAdmin ? 'super_admin' : existingUser.role);
    return await storageService.upsertUser({ ...existingUser, photoURL, name, role });
  }

  // Otherwise create from Firebase data
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
  return await storageService.upsertUser({
    id: firebaseUser.uid,
    name,
    email,
    role: firestoreRole || (isSuperAdmin ? 'super_admin' : 'resident') as UserRole,
    photoURL,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    notifsEnabled: true,
  });
};
