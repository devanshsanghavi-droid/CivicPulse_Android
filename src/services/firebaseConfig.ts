// src/services/firebaseConfig.ts
// SAME as your web version - Firebase SDK works identically in React Native!
// Just copy this exactly as-is.

import { initializeApp } from "firebase/app";
//hi
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBKncOQB52e-em2Zi7w9TYlPZlByPx47MM",
  authDomain: "civicpulsewebsite.firebaseapp.com",
  projectId: "civicpulsewebsite",
  storageBucket: "civicpulsewebsite.firebasestorage.app",
  messagingSenderId: "309051340001",
  appId: "1:309051340001:web:b642bfc4df4a4b9daab3a0"
};

const app = initializeApp(firebaseConfig);

// @ts-expect-error - getReactNativePersistence exists at runtime but missing from type defs
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const db = getFirestore(app);
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

// NOTE: GoogleAuthProvider is NOT used in React Native.
// Google Sign-In is handled by @react-native-google-signin/google-signin instead.
// See firebaseAuth.ts for the mobile implementation.

export default app;
