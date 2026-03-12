// src/constants/index.ts
// Identical to web version - no changes needed!

import { Category } from '../types';

export const CATEGORIES: Category[] = [
  { id: '1', name: 'Potholes/Road Damage', icon: '🕳️', active: true },
  { id: '2', name: 'Streetlights', icon: '💡', active: true },
  { id: '3', name: 'Trash/Graffiti', icon: '🗑️', active: true },
  { id: '4', name: 'Sidewalks', icon: '🚶', active: true },
  { id: '5', name: 'Parks', icon: '🌳', active: true },
  { id: '6', name: 'Traffic Signals', icon: '🚦', active: true },
  { id: '7', name: 'Water/Drainage', icon: '💧', active: true },
  { id: '8', name: 'Safety Concern', icon: '⚠️', active: true },
  { id: '9', name: 'Other', icon: '📋', active: true },
];

export const APP_NAME = 'CivicPulse';
export const CITY_NAME = 'Community';

export const TRENDING_WEIGHT_UPVOTES = 2;
export const TRENDING_RECENCY_DAYS = 7;

// Super admin emails - same as web
export const SUPER_ADMIN_EMAILS = ['notdev42@gmail.com', 'civicpulsehelpdesk@gmail.com'];

// Test account — bypasses email verification
export const TEST_ACCOUNT_EMAIL = 'developertest@gmail.com';
