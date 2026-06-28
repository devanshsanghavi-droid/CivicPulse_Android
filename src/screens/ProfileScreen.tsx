// src/screens/ProfileScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Switch, Alert, SafeAreaView, Linking, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { signOutUser } from '../services/firebaseAuth';
import { storageService } from '../services/storage';
import { firestoreService } from '../services/firestoreService';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';
import { CATEGORIES } from '../constants';
import { Issue } from '../types';

type Nav = StackNavigationProp<RootStackParamList>;

const STATUS_COLORS_LIGHT: Record<string, { bg: string; text: string }> = {
  open: { bg: '#fee2e2', text: '#dc2626' },
  acknowledged: { bg: '#fef3c7', text: '#d97706' },
  resolved: { bg: '#dcfce7', text: '#16a34a' },
};
const STATUS_COLORS_DARK: Record<string, { bg: string; text: string }> = {
  open: { bg: '#7f1d1d', text: '#fca5a5' },
  acknowledged: { bg: '#78350f', text: '#fcd34d' },
  resolved: { bg: '#14532d', text: '#86efac' },
};

export default function ProfileScreen() {
  const { user, setUser, isDark, toggleDarkMode, theme, triggerFeedRefresh, feedRefreshToken } = useApp();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState({ reportCount: 0, upvoteCount: 0 });
  const [myIssues, setMyIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProfileData = useCallback(async () => {
    if (!user) return;
    try {
      const [userStats, issues] = await Promise.all([
        firestoreService.getUserStats(user.id),
        firestoreService.getIssuesByUser(user.id),
      ]);
      setStats(userStats);
      setMyIssues(issues);
    } catch (err) {
      console.error('Profile: failed to load data', err);
    } finally {
      setIssuesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setIssuesLoading(true);
    loadProfileData();
  }, [loadProfileData, feedRefreshToken]);

  // Reload when the Profile tab regains focus — picks up new reports
  // submitted from the Report tab without waiting on the polling cycle.
  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );

  const confirmDelete = (issue: Issue) => {
    Alert.alert(
      'Delete Report?',
      `"${issue.title}" will be removed from the feed and the map. This can't be undone from the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(issue),
        },
      ],
    );
  };

  const handleDelete = async (issue: Issue) => {
    if (!user) return;
    setDeletingId(issue.id);
    // Optimistic removal so the row disappears instantly.
    setMyIssues(prev => prev.filter(i => i.id !== issue.id));
    setStats(prev => ({ ...prev, reportCount: Math.max(0, prev.reportCount - 1) }));
    try {
      await firestoreService.deleteOwnIssue(issue.id, user.name);
      // Force the Feed (and any other token-listening screens) to refetch
      // so the deleted issue disappears everywhere without a manual refresh.
      triggerFeedRefresh();
    } catch (err: any) {
      console.error('Profile: delete failed', err);
      Alert.alert('Delete Failed', err.message || 'Could not delete the report. Please try again.');
      // Roll back the optimistic update.
      loadProfileData();
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={72} color={theme.border} />
          <Text style={[styles.authRequired, { color: theme.textMuted }]}>AUTHENTICATION REQUIRED</Text>
          <TouchableOpacity style={[styles.signInBtn, { backgroundColor: theme.primary }]} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.signInBtnText}>SIGN IN</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          try {
            await signOutUser();
            await setUser(null);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        }
      }
    ]);
  };

  const toggleNotifs = async () => {
    const updated = await storageService.updateProfile(user.id, { notifsEnabled: !user.notifsEnabled });
    if (updated) await setUser(updated);
  };

  const reportProblem = () => {
    Linking.openURL('mailto:civicpulsehelpdesk@gmail.com?subject=CivicPulse Support Request&body=Hi CivicPulse Team,%0D%0A%0D%0AI\'d like to report an issue:');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header with Large Avatar */}
        <View style={styles.header}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={[styles.avatar, { borderColor: theme.primaryBorder }]} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]}>
              <Ionicons name="person" size={40} color={theme.primary} />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{user.name}</Text>
            <Text style={[styles.email, { color: theme.textMuted }]}>{user.email}</Text>
            <View style={styles.tagRow}>
              <View style={[styles.roleTag, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.roleTagText, { color: theme.primary }]}>{user.role.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ACTIVITY METRICS</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.primary }]}>{stats.reportCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>REPORTS LOGGED</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.success }]}>{stats.upvoteCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>COLLECTIVE VOTES</Text>
          </View>
        </View>

        {/* Your Reports — tap to open, trash icon to delete */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>YOUR REPORTS</Text>
        {issuesLoading ? (
          <View style={[styles.reportsEmpty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : myIssues.length === 0 ? (
          <View style={[styles.reportsEmpty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="document-outline" size={22} color={theme.textMuted} />
            <Text style={[styles.reportsEmptyText, { color: theme.textMuted }]}>
              You haven&apos;t filed any reports yet
            </Text>
          </View>
        ) : (
          myIssues.map(issue => {
            const category = CATEGORIES.find(c => c.id === issue.categoryId);
            const statusPalette = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
            const statusColors = statusPalette[issue.status] || statusPalette.open;
            const isDeleting = deletingId === issue.id;
            return (
              <View
                key={issue.id}
                style={[styles.reportRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <TouchableOpacity
                  style={styles.reportRowContent}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('IssueDetail', { issueId: issue.id })}
                  disabled={isDeleting}
                >
                  <View style={styles.reportTopRow}>
                    <Text style={[styles.reportCategory, { color: theme.primary }]} numberOfLines={1}>
                      {category?.name || 'Other'}
                    </Text>
                    <View style={[styles.reportStatusBadge, { backgroundColor: statusColors.bg }]}>
                      <Text style={[styles.reportStatusText, { color: statusColors.text }]}>
                        {issue.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.reportTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                    {issue.title || 'Untitled Report'}
                  </Text>
                  <Text style={[styles.reportMeta, { color: theme.textMuted }]}>
                    {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {typeof issue.upvoteCount === 'number' ? `  ·  ${issue.upvoteCount} upvote${issue.upvoteCount === 1 ? '' : 's'}` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reportDeleteBtn, { borderColor: theme.border }]}
                  onPress={() => confirmDelete(issue)}
                  disabled={isDeleting}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={`Delete report: ${issue.title}`}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Settings with Chevrons */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ACCOUNT CONTROL</Text>

        {/* Appearance / Dark Mode */}
        <View style={[styles.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.settingLeft}>
            <Ionicons name="color-palette-outline" size={20} color={theme.textMuted} />
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Dark Mode</Text>
          </View>
          <ThemeToggle isDark={isDark} onToggle={toggleDarkMode} />
        </View>

        {/* Notifications Toggle */}
        <TouchableOpacity style={[styles.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => { }}>
          <View style={styles.settingLeft}>
            <Ionicons name="notifications-outline" size={20} color={theme.textMuted} />
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Notification Preferences</Text>
          </View>
          <View style={styles.settingRight}>
            <Switch
              value={!!user.notifsEnabled}
              onValueChange={toggleNotifs}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </TouchableOpacity>

        {/* Report a Problem */}
        <TouchableOpacity style={[styles.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={reportProblem}>
          <View style={styles.settingLeft}>
            <Ionicons name="warning-outline" size={20} color={theme.textMuted} />
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Report a Problem</Text>
          </View>
          <View style={styles.settingRight}>
            <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          </View>
        </TouchableOpacity>

        {/* Visit Website */}
        <TouchableOpacity style={[styles.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => Linking.openURL('https://civicpulseweb.pages.dev/')}>
          <View style={styles.settingLeft}>
            <Ionicons name="globe-outline" size={20} color={theme.textMuted} />
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Visit Website</Text>
          </View>
          <View style={styles.settingRight}>
            <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          </View>
        </TouchableOpacity>

        {/* Log Out */}
        <TouchableOpacity style={[styles.logoutBtn, isDark && { backgroundColor: '#1c1917', borderColor: '#7f1d1d' }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>LOG OUT</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.lg },
  authRequired: { ...TYPOGRAPHY.sectionLabel },
  signInBtn: { borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.xxxl, paddingVertical: SPACING.md },
  signInBtnText: { ...TYPOGRAPHY.caption, color: '#ffffff', fontWeight: '900', letterSpacing: 2 },

  header: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.xxxl, alignItems: 'center' },
  avatar: { width: 96, height: 96, borderRadius: BORDER_RADIUS.xxl, borderWidth: 2 },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: BORDER_RADIUS.xxl,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  headerInfo: { flex: 1, justifyContent: 'center' },
  name: { ...TYPOGRAPHY.pageTitle, fontSize: 22, marginBottom: SPACING.xs },
  email: { ...TYPOGRAPHY.caption, fontWeight: '600', marginBottom: SPACING.sm },
  tagRow: { flexDirection: 'row', gap: SPACING.sm },
  roleTag: { borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  roleTagText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1 },
  sectionLabel: { ...TYPOGRAPHY.sectionLabel, marginBottom: SPACING.md, marginTop: SPACING.lg },

  statsGrid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, padding: SPACING.lg, alignItems: 'center',
    ...SHADOWS.subtle,
  },
  statValue: { ...TYPOGRAPHY.pageTitle, fontSize: 28, marginBottom: SPACING.xs },
  statLabel: { ...TYPOGRAPHY.microLabel, textAlign: 'center' },

  // Your Reports list
  reportsEmpty: {
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg,
    alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reportsEmptyText: { ...TYPOGRAPHY.caption, fontWeight: '600' },
  reportRow: {
    flexDirection: 'row', alignItems: 'stretch',
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  reportRowContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    gap: 4,
  },
  reportTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: 2,
  },
  reportCategory: {
    ...TYPOGRAPHY.microLabel,
    letterSpacing: 1.2,
    flex: 1,
  },
  reportStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  reportStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  reportTitle: { ...TYPOGRAPHY.body, fontWeight: '800', fontSize: 14 },
  reportMeta: { ...TYPOGRAPHY.microLabel, fontWeight: '600', letterSpacing: 0.3 },
  reportDeleteBtn: {
    width: 48,
    alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1,
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, marginBottom: SPACING.sm,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  settingLabel: { ...TYPOGRAPHY.body, fontWeight: '700' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  settingValue: { ...TYPOGRAPHY.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md, marginTop: SPACING.xl,
  },
  logoutText: { ...TYPOGRAPHY.caption, fontWeight: '900', letterSpacing: 2 },
});
