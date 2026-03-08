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
import { User } from "../types";
import { SUPER_ADMIN_EMAILS } from "../constants";

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
 * Sign up with email and password
 */
export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

    // Set display name
    await updateProfile(firebaseUser, { displayName });

    const now = new Date().toISOString();
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    const role = isSuperAdmin ? 'super_admin' : 'resident';

    const user = await storageService.upsertUser({
      id: firebaseUser.uid,
      name: displayName,
      email,
      role,
      photoURL: '',
      createdAt: now,
      lastLoginAt: now,
      notifsEnabled: true,
    });

    try {
      await firestoreService.logLogin({ userId: user.id, email, name: displayName, photoURL: '', loginAt: now, userAgent: 'CivicPulse iOS App' });
    } catch (e) { console.warn('Failed to log login event:', e); }

    try {
      await firestoreService.upsertUserRecord({ id: user.id, email, name: displayName, photoURL: '', role: user.role, banType: 'none', createdAt: now, lastLoginAt: now });
    } catch (e) { console.warn('Failed to upsert user record:', e); }

    return user;
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') throw new Error('An account with this email already exists.');
    if (error.code === 'auth/weak-password') throw new Error('Password must be at least 6 characters.');
    if (error.code === 'auth/invalid-email') throw new Error('Please enter a valid email address.');
    throw new Error(error.message || 'Failed to create account');
  }
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

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
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Incorrect email or password.');
    }
    if (error.code === 'auth/invalid-email') throw new Error('Please enter a valid email address.');
    if (error.code === 'auth/too-many-requests') throw new Error('Too many attempts. Please try again later.');
    throw new Error(error.message || 'Failed to sign in');
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
