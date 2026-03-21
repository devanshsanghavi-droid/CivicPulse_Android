// src/screens/UserProfileScreen.tsx
// Reddit-style public user profile — viewable by anyone
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, ActivityIndicator, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { firestoreService } from '../services/firestoreService';
import { Issue, Comment, UserRecord } from '../types';
import { CATEGORIES } from '../constants';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

type RouteType = RouteProp<RootStackParamList, 'UserProfile'>;
type Nav = StackNavigationProp<RootStackParamList>;

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string; darkColor: string; darkBg: string }> = {
  resident: { label: 'RESIDENT', color: '#2563eb', bg: '#eff6ff', darkColor: '#93c5fd', darkBg: '#1e3a5f' },
  admin: { label: 'ADMIN', color: '#d97706', bg: '#fefce8', darkColor: '#fcd34d', darkBg: '#78350f' },
  super_admin: { label: 'SUPER ADMIN', color: '#dc2626', bg: '#fef2f2', darkColor: '#fca5a5', darkBg: '#7f1d1d' },
  guest: { label: 'GUEST', color: '#6b7280', bg: '#f3f4f6', darkColor: '#9ca3af', darkBg: '#374151' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#fee2e2', text: '#dc2626' },
  acknowledged: { bg: '#fef3c7', text: '#d97706' },
  resolved: { bg: '#dcfce7', text: '#16a34a' },
};

export default function UserProfileScreen() {
  const { isDark, theme } = useApp();
  const route = useRoute<RouteType>();
  const navigation = useNavigation<Nav>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [stats, setStats] = useState({ reportCount: 0, upvoteCount: 0 });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [userRecord, userStats, userIssues, userComments] = await Promise.all([
          firestoreService.getUserRecord(userId),
          firestoreService.getUserStats(userId),
          firestoreService.getIssuesByUser(userId),
          firestoreService.getCommentsByUser(userId),
        ]);
        if (cancelled) return;
        setProfile(userRecord);
        setStats(userStats);
        setIssues(userIssues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setComments(userComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.notFound, { color: theme.textMuted }]}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const role = ROLE_LABELS[profile.role] || ROLE_LABELS.resident;
  const joinDate = new Date(profile.createdAt);
  const joinLabel = joinDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile Header */}
        <View style={styles.header}>
          {profile.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={[styles.avatar, { borderColor: theme.border }]} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primaryLight, borderColor: theme.border }]}>
              <Ionicons name="person" size={36} color={theme.primary} />
            </View>
          )}
          <Text style={[styles.name, { color: theme.textPrimary }]}>{profile.name}</Text>
          <View style={styles.tagRow}>
            <View style={[styles.roleTag, { backgroundColor: isDark ? role.darkBg : role.bg }]}>
              <Text style={[styles.roleTagText, { color: isDark ? role.darkColor : role.color }]}>{role.label}</Text>
            </View>
            <View style={styles.joinTag}>
              <Ionicons name="calendar-outline" size={11} color={theme.textMuted} />
              <Text style={[styles.joinText, { color: theme.textMuted }]}>Joined {joinLabel}</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.primary }]}>{stats.reportCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Reports</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.success }]}>{stats.upvoteCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Upvotes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.warning || '#d97706' }]}>{comments.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Comments</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'posts' && [styles.tabActive, { borderBottomColor: theme.primary }]]}
            onPress={() => setActiveTab('posts')}
          >
            <Ionicons name="document-text-outline" size={16} color={activeTab === 'posts' ? theme.primary : theme.textMuted} />
            <Text style={[styles.tabText, { color: theme.textMuted }, activeTab === 'posts' && { color: theme.primary }]}>Posts ({issues.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'comments' && [styles.tabActive, { borderBottomColor: theme.primary }]]}
            onPress={() => setActiveTab('comments')}
          >
            <Ionicons name="chatbubble-outline" size={16} color={activeTab === 'comments' ? theme.primary : theme.textMuted} />
            <Text style={[styles.tabText, { color: theme.textMuted }, activeTab === 'comments' && { color: theme.primary }]}>Comments ({comments.length})</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeTab === 'posts' && (
          issues.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color={theme.border} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No reports yet</Text>
            </View>
          ) : (
            issues.map(issue => {
              const category = CATEGORIES.find(c => c.id === issue.categoryId);
              const sc = STATUS_COLORS[issue.status] || STATUS_COLORS.open;
              return (
                <TouchableOpacity
                  key={issue.id}
                  style={[styles.postCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => navigation.navigate('IssueDetail', { issueId: issue.id })}
                  activeOpacity={0.8}
                >
                  <View style={styles.postHeader}>
                    <Text style={[styles.postCategory, { color: theme.primary }]}>{category?.name}</Text>
                    <View style={[styles.postStatus, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.postStatusText, { color: sc.text }]}>{issue.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={[styles.postTitle, { color: theme.textPrimary }]} numberOfLines={2}>{issue.title}</Text>
                  {issue.description ? (
                    <Text style={[styles.postDesc, { color: theme.textSecondary }]} numberOfLines={2}>{issue.description}</Text>
                  ) : null}
                  <View style={styles.postFooter}>
                    <Text style={[styles.postDate, { color: theme.textMuted }]}>
                      {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                    <View style={styles.postUpvotes}>
                      <Ionicons name="thumbs-up" size={12} color={theme.primary} />
                      <Text style={[styles.postUpvoteCount, { color: theme.textMuted }]}>{issue.upvoteCount}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )
        )}

        {activeTab === 'comments' && (
          comments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={40} color={theme.border} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No comments yet</Text>
            </View>
          ) : (
            comments.map(comment => (
              <TouchableOpacity
                key={comment.id}
                style={[styles.commentCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('IssueDetail', { issueId: comment.issueId })}
                activeOpacity={0.8}
              >
                <Text style={[styles.commentBody, { color: theme.textSecondary }]} numberOfLines={3}>{comment.body}</Text>
                <View style={styles.commentFooter}>
                  <Ionicons name="return-down-forward-outline" size={12} color={theme.textMuted} />
                  <Text style={[styles.commentDate, { color: theme.textMuted }]}>
                    {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  notFound: { ...TYPOGRAPHY.body, fontWeight: '700' },

  // Header
  header: { alignItems: 'center', marginBottom: SPACING.xl },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, marginBottom: SPACING.md },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: SPACING.md,
  },
  name: { ...TYPOGRAPHY.pageTitle, fontSize: 22, marginBottom: SPACING.sm, textAlign: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  roleTag: { borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  roleTagText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1 },
  joinTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  joinText: { fontSize: 11, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    padding: SPACING.md, alignItems: 'center', ...SHADOWS.subtle,
  },
  statValue: { ...TYPOGRAPHY.pageTitle, fontSize: 24, marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: SPACING.md },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SPACING.md, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabText: { fontSize: 13, fontWeight: '700' },

  // Posts
  postCard: {
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.subtle,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  postCategory: { ...TYPOGRAPHY.microLabel, flex: 1 },
  postStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.round },
  postStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  postTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 15, marginBottom: 4, lineHeight: 21 },
  postDesc: { ...TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginBottom: SPACING.sm },
  postFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postDate: { fontSize: 11, fontWeight: '600' },
  postUpvotes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postUpvoteCount: { fontSize: 12, fontWeight: '700' },

  // Comments
  commentCard: {
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.subtle,
  },
  commentBody: { ...TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginBottom: SPACING.sm },
  commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentDate: { fontSize: 11, fontWeight: '600' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.sm },
  emptyText: { ...TYPOGRAPHY.body, fontWeight: '600' },
});
