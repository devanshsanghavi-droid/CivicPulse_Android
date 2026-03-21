// src/services/firestoreService.ts
// Nearly identical to your web version!
// The Firebase Firestore SDK works the same in React Native.

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  deleteDoc,
  increment,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebaseConfig';
import {
  Issue,
  Comment,
  IssueStatus,
  LoginRecord,
  UserRecord,
  UserRole,
  BanType,
  Notification,
  Report,
  ResolutionSuggestion
} from '../types';
import { calculateTrendingScore } from './storage';
import {
  checkRateLimit, checkBanned, checkDuplicate,
  sanitizeText, validatePhotoUri, validatePhotoBlob,
  LIMITS
} from './security';

// Normalize issue photos from various Firestore field formats
function normalizeIssuePhotos(raw: any): Issue {
  const issue = raw as Issue;
  // If photos field is already a valid array of {id, url} objects, use it
  if (Array.isArray(issue.photos) && issue.photos.length > 0 && issue.photos[0]?.url) {
    return issue;
  }
  // Check alternate field names from web app or older data
  const data = raw as any;
  const altPhotos: string[] =
    data.imageUrls || data.images || data.photoUrls || [];
  if (Array.isArray(altPhotos) && altPhotos.length > 0) {
    // Convert string URLs to IssuePhoto objects
    issue.photos = altPhotos.map((url: string, i: number) => ({
      id: `photo_${i}`,
      url: typeof url === 'string' ? url : (url as any).url || '',
    })).filter(p => p.url);
  }
  // Ensure photos is always an array
  if (!Array.isArray(issue.photos)) {
    issue.photos = [];
  }
  return issue;
}

export const firestoreService = {

  // --- Issues ---

  getIssues: async (sort: string = 'trending', categoryId?: string): Promise<Issue[]> => {
    try {
      let q = query(
        collection(db, 'issues'),
        where('hidden', '==', false)
      );
      const snapshot = await getDocs(q);
      let issues: Issue[] = snapshot.docs.map(d => normalizeIssuePhotos({ id: d.id, ...d.data() }));

      if (categoryId) {
        issues = issues.filter(i => i.categoryId === categoryId);
      }

      switch (sort) {
        case 'trending':
          return issues.sort((a, b) => calculateTrendingScore(b) - calculateTrendingScore(a));
        case 'newest':
          return issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        case 'upvoted':
          return issues.sort((a, b) => b.upvoteCount - a.upvoteCount);
        default:
          return issues;
      }
    } catch (error) {
      console.error('getIssues error:', error);
      return [];
    }
  },

  getIssue: async (id: string): Promise<Issue | null> => {
    try {
      const snap = await getDoc(doc(db, 'issues', id));
      return snap.exists() ? normalizeIssuePhotos({ id: snap.id, ...snap.data() }) : null;
    } catch (error) {
      console.error('getIssue error:', error);
      return null;
    }
  },

  createIssue: async (data: Partial<Issue>): Promise<Issue> => {
    await checkBanned(data.createdBy!);
    await checkRateLimit('createIssue', data.createdBy!);
    checkDuplicate(data.createdBy!, data.title!, data.categoryId!);

    const newIssue = {
      createdBy: data.createdBy!,
      creatorName: sanitizeText(data.creatorName || 'Resident', LIMITS.USER_NAME),
      creatorPhotoURL: data.creatorPhotoURL || '',
      title: sanitizeText(data.title!, LIMITS.ISSUE_TITLE),
      description: sanitizeText(data.description || '', LIMITS.ISSUE_DESCRIPTION),
      categoryId: data.categoryId!,
      status: 'open' as IssueStatus,
      latitude: data.latitude!,
      longitude: data.longitude!,
      address: data.address || 'Unknown Address',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hidden: false,
      upvoteCount: 0,
      photos: data.photos || []
    };
    const docRef = await addDoc(collection(db, 'issues'), newIssue);
    return { id: docRef.id, ...newIssue };
  },

  updateIssuePhotos: async (id: string, photos: { id: string; url: string }[]): Promise<void> => {
    await updateDoc(doc(db, 'issues', id), {
      photos,
      updatedAt: new Date().toISOString()
    });
  },

  updateIssueStatus: async (id: string, status: IssueStatus, note?: string): Promise<void> => {
    await updateDoc(doc(db, 'issues', id), {
      status,
      statusNote: note ? sanitizeText(note, LIMITS.STATUS_NOTE) : '',
      updatedAt: new Date().toISOString()
    });
  },

  toggleUpvote: async (issueId: string, userId: string, isAdding: boolean): Promise<void> => {
    await checkBanned(userId);
    await checkRateLimit('toggleUpvote', userId);

    // Update Firestore upvote count
    await updateDoc(doc(db, 'issues', issueId), {
      upvoteCount: increment(isAdding ? 1 : -1)
    });

    // Track the upvote record in 'upvotes' collection
    const upvoteRef = doc(db, 'upvotes', `${issueId}_${userId}`);
    if (isAdding) {
      await setDoc(upvoteRef, { issueId, userId });
    } else {
      await deleteDoc(upvoteRef);
    }
  },

  deleteIssue: async (id: string, adminName: string): Promise<void> => {
    await updateDoc(doc(db, 'issues', id), {
      hidden: true,
      deletedAt: new Date().toISOString(),
      deletedByName: adminName,
      updatedAt: new Date().toISOString()
    });
  },

  // --- Comments ---

  getComments: async (issueId: string): Promise<Comment[]> => {
    try {
      const q = query(
        collection(db, 'comments'),
        where('issueId', '==', issueId),
        where('hidden', '==', false)
      );
      const snapshot = await getDocs(q);
      const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
      return comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('getComments error:', error);
      return [];
    }
  },

  addComment: async (
    issueId: string,
    userId: string,
    userName: string,
    userPhotoURL: string,
    body: string
  ): Promise<Comment> => {
    await checkBanned(userId);
    await checkRateLimit('addComment', userId);

    const newComment = {
      issueId,
      userId,
      userName: sanitizeText(userName, LIMITS.USER_NAME),
      userPhotoURL,
      body: sanitizeText(body, LIMITS.COMMENT_BODY),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hidden: false
    };
    const docRef = await addDoc(collection(db, 'comments'), newComment);
    return { id: docRef.id, ...newComment };
  },

  deleteComment: async (id: string, adminName: string): Promise<void> => {
    await updateDoc(doc(db, 'comments', id), {
      hidden: true,
      deletedAt: new Date().toISOString(),
      deletedByName: adminName,
    });
  },

  // --- Notifications ---

  getNotifications: async (userId: string): Promise<Notification[]> => {
    try {
      // Requires composite index on (userId ASC, createdAt DESC)
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
    } catch (error) {
      console.error('getNotifications error:', error);
      return [];
    }
  },

  addNotification: async (
    userId: string,
    title: string,
    message: string,
    type: Notification['type'],
    issueId: string
  ): Promise<void> => {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      issueId,
      read: false,
      createdAt: new Date().toISOString()
    });
  },

  markNotificationsRead: async (userId: string): Promise<void> => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map(d => updateDoc(d.ref, { read: true })));
  },

  // --- User Stats ---

  getUserStats: async (userId: string): Promise<{ reportCount: number; upvoteCount: number }> => {
    try {
      const q = query(collection(db, 'issues'), where('createdBy', '==', userId));
      const snapshot = await getDocs(q);
      const issues = snapshot.docs.map(d => d.data() as Issue);
      return {
        reportCount: issues.length,
        upvoteCount: issues.reduce((acc, i) => acc + (i.upvoteCount || 0), 0)
      };
    } catch {
      return { reportCount: 0, upvoteCount: 0 };
    }
  },

  // --- Admin ---

  logLogin: async (record: Omit<LoginRecord, 'id'>): Promise<void> => {
    try {
      await addDoc(collection(db, 'logins'), record);
    } catch (e) {
      console.warn('logLogin failed:', e);
    }
  },

  upsertUserRecord: async (record: UserRecord): Promise<void> => {
    try {
      await setDoc(doc(db, 'users', record.id), record, { merge: true });
    } catch (e) {
      console.warn('upsertUserRecord failed:', e);
    }
  },

  getAllUsers: async (): Promise<UserRecord[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserRecord));
    } catch {
      return [];
    }
  },

  updateUserRecord: async (userId: string, data: Partial<UserRecord>): Promise<void> => {
    await updateDoc(doc(db, 'users', userId), data);
  },

  // --- Photo Upload ---
  // Replaces web's FileReader/base64 approach with React Native's blob upload

  uploadPhoto: async (localUri: string, issueId: string): Promise<string> => {
    console.log('[uploadPhoto] URI:', localUri.substring(0, 100));
    validatePhotoUri(localUri);
    console.log('[uploadPhoto] URI validated');
    const response = await fetch(localUri);
    const blob = await response.blob();
    console.log('[uploadPhoto] Blob size:', blob.size, 'type:', blob.type);
    await validatePhotoBlob(blob);
    console.log('[uploadPhoto] Blob validated');
    const filename = `issues/${issueId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);
    console.log('[uploadPhoto] Uploaded to Storage');
    const url = await getDownloadURL(storageRef);
    console.log('[uploadPhoto] Download URL:', url.substring(0, 80));
    return url;
  },

  // --- Reports ---

  submitReport: async (report: Omit<Report, 'id'>): Promise<void> => {
    await checkRateLimit('submitReport', report.reporterUserId);
    const sanitized = {
      ...report,
      reason: sanitizeText(report.reason, LIMITS.REPORT_REASON),
      details: report.details ? sanitizeText(report.details, LIMITS.ISSUE_DESCRIPTION) : undefined,
    };
    await addDoc(collection(db, 'reports'), sanitized);
  },

  getReports: async (): Promise<Report[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'reports'));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Report));
    } catch {
      return [];
    }
  },

  // --- User-specific queries ---

  getIssuesByUser: async (userId: string): Promise<Issue[]> => {
    try {
      const q = query(collection(db, 'issues'), where('createdBy', '==', userId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => normalizeIssuePhotos({ id: d.id, ...d.data() }))
        .filter(i => !i.hidden)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  getCommentsByUser: async (userId: string): Promise<Comment[]> => {
    try {
      const q = query(collection(db, 'comments'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Comment))
        .filter(c => !c.hidden)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  // --- Deleted items (admin) ---

  getDeletedIssues: async (): Promise<Issue[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'issues'));
      return snapshot.docs
        .map(d => normalizeIssuePhotos({ id: d.id, ...d.data() }))
        .filter(i => i.hidden)
        .sort((a, b) => new Date(b.deletedAt || b.updatedAt).getTime() - new Date(a.deletedAt || a.updatedAt).getTime());
    } catch {
      return [];
    }
  },

  getDeletedComments: async (): Promise<Comment[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'comments'));
      return snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Comment))
        .filter(c => c.hidden)
        .sort((a, b) => new Date(b.deletedAt || b.updatedAt).getTime() - new Date(a.deletedAt || a.updatedAt).getTime());
    } catch {
      return [];
    }
  },

  restoreIssue: async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'issues', id), {
      hidden: false,
      deletedAt: '',
      deletedByName: '',
      updatedAt: new Date().toISOString()
    });
  },

  restoreComment: async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'comments', id), {
      hidden: false,
      deletedAt: '',
      deletedByName: '',
      updatedAt: new Date().toISOString()
    });
  },

  // --- Login history (admin) ---

  getLoginHistory: async (max: number = 50): Promise<LoginRecord[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'logins'));
      return snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as LoginRecord))
        .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime())
        .slice(0, max);
    } catch {
      return [];
    }
  },

  // --- Ban management (admin) ---

  getBannedUsers: async (): Promise<UserRecord[]> => {
    try {
      const q = query(collection(db, 'users'), where('banType', 'in', ['temporary', 'permanent']));
      const snapshot = await getDocs(q);
      const bannedUsers: UserRecord[] = [];
      const now = new Date();

      for (const d of snapshot.docs) {
        const rec = { id: d.id, ...d.data() } as UserRecord;
        // Auto-unban expired temp bans
        if (rec.banType === 'temporary' && rec.bannedUntil && new Date(rec.bannedUntil) <= now) {
          await updateDoc(doc(db, 'users', rec.id), {
            banType: 'none', bannedAt: '', bannedUntil: '', banReason: ''
          });
          continue;
        }
        bannedUsers.push(rec);
      }
      return bannedUsers;
    } catch {
      return [];
    }
  },

  banUser: async (userId: string, banType: 'temporary' | 'permanent', reason?: string, durationHours?: number): Promise<void> => {
    if (banType === 'temporary' && (!durationHours || durationHours <= 0)) {
      throw new Error('Temporary bans require a duration greater than 0.');
    }
    const now = new Date();
    const updates: Record<string, any> = {
      banType,
      bannedAt: now.toISOString(),
      banReason: reason || ''
    };
    if (banType === 'temporary' && durationHours) {
      const expiry = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
      updates.bannedUntil = Timestamp.fromDate(expiry);
    } else if (banType === 'permanent') {
      updates.bannedUntil = '';
    }
    await updateDoc(doc(db, 'users', userId), updates);
  },

  unbanUser: async (userId: string): Promise<void> => {
    await updateDoc(doc(db, 'users', userId), {
      banType: 'none',
      bannedAt: '',
      bannedUntil: '',
      banReason: ''
    });
  },

  // --- Role management (super_admin only) ---

  setUserRole: async (userId: string, role: UserRole): Promise<void> => {
    await updateDoc(doc(db, 'users', userId), { role });
  },

  // --- Resolution Suggestions ---

  submitResolutionSuggestion: async (data: Omit<ResolutionSuggestion, 'id'>): Promise<ResolutionSuggestion> => {
    await checkBanned(data.suggestedBy);
    await checkRateLimit('submitSuggestion', data.suggestedBy);
    const sanitized = {
      ...data,
      reason: data.reason ? sanitizeText(data.reason, LIMITS.RESOLUTION_REASON) : undefined,
    };
    const docRef = await addDoc(collection(db, 'resolutionSuggestions'), sanitized);
    return { id: docRef.id, ...sanitized };
  },

  getResolutionSuggestions: async (status?: string): Promise<ResolutionSuggestion[]> => {
    try {
      const q = status
        ? query(collection(db, 'resolutionSuggestions'), where('status', '==', status))
        : query(collection(db, 'resolutionSuggestions'));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as ResolutionSuggestion))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch { return []; }
  },

  reviewResolutionSuggestion: async (id: string, status: 'approved' | 'rejected', reviewedBy: string): Promise<void> => {
    await updateDoc(doc(db, 'resolutionSuggestions', id), {
      status,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    });
  },
};
