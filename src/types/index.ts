// src/types/index.ts
// Identical to web version - no changes needed!

export type UserRole = 'guest' | 'resident' | 'admin' | 'super_admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  neighborhood?: string;
  notifsEnabled?: boolean;
}

export type IssueStatus = 'open' | 'acknowledged' | 'resolved';

export interface Category {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export interface IssuePhoto {
  id: string;
  url: string;
}

export interface Issue {
  id: string;
  createdBy: string;
  creatorName: string;
  creatorPhotoURL?: string;
  title: string;
  description: string;
  categoryId: string;
  status: IssueStatus;
  statusNote?: string;
  latitude: number;
  longitude: number;
  address?: string;
  createdAt: string;
  updatedAt: string;
  hidden: boolean;
  deletedAt?: string;
  deletedByName?: string;
  upvoteCount: number;
  photos: IssuePhoto[];
}

export interface Comment {
  id: string;
  issueId: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  hidden: boolean;
  deletedAt?: string;
  deletedByName?: string;
  likeCount: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'upvote' | 'comment' | 'status_change';
  issueId: string;
  read: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterUserId: string;
  contentType: 'issue' | 'comment';
  contentId: string;
  reason: string;
  details?: string;
  createdAt: string;
  resolvedByAdminId?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface Upvote {
  id: string;
  issueId: string;
  userId: string;
  userName?: string;
  userPhotoURL?: string;
}

export interface DigestSettings {
  enabled: boolean;
  recipientEmails: string;
  scheduleDay: string;
  scheduleTime: string;
  lookbackDays: number;
  topN: number;
}

export interface LoginRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  photoURL?: string;
  loginAt: string;
  userAgent: string;
}

export interface ResolutionSuggestion {
  id: string;
  issueId: string;
  issueTitle: string;
  suggestedBy: string;
  suggestedByName: string;
  suggestedByPhotoURL?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type BanType = 'none' | 'temporary' | 'permanent';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  banType: BanType;
  bannedAt?: string;
  bannedUntil?: string;
  banReason?: string;
  createdAt: string;
  lastLoginAt: string;
}
