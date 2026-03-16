// src/screens/FeedScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Image, SafeAreaView, RefreshControl, ScrollView, KeyboardAvoidingView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { firestoreService } from '../services/firestoreService';
import { Issue } from '../types';
import { CATEGORIES } from '../constants';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useApp } from '../context/AppContext';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';
import { AppTheme } from '../constants/theme';
import GuestBanner from '../components/GuestBanner';

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

const StatusBadge = ({ status, isDark }: { status: string; isDark: boolean }) => {
  const palette = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  const colors = palette[status] || palette.open;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
};

const IssueCard = ({ issue, onPress, theme, isDark }: { issue: Issue; onPress: () => void; theme: AppTheme; isDark: boolean }) => {
  const category = CATEGORIES.find(c => c.id === issue.categoryId);
  const photo = issue.photos[0]?.url;

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onPress} activeOpacity={0.85}>
      {photo && (
        <View style={styles.cardImageWrap}>
          <Image source={{ uri: photo }} style={styles.cardImage} />
          <View style={styles.cardImageBadge}>
            <StatusBadge status={issue.status} isDark={isDark} />
          </View>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardCategory, { color: theme.primary }]}>{category?.name}</Text>
          {!photo && <StatusBadge status={issue.status} isDark={isDark} />}
          <Text style={[styles.cardDate, { color: theme.textMuted }]}>
            {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{issue.title || 'Untitled Issue'}</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>{issue.description || 'No description available'}</Text>

        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <View style={styles.cardAuthor}>
            {issue.creatorPhotoURL ? (
              <Image source={{ uri: issue.creatorPhotoURL }} style={[styles.avatar, { borderColor: theme.border }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.border }]}>
                <Ionicons name="person" size={12} color={theme.textMuted} />
              </View>
            )}
            <Text style={[styles.authorName, { color: theme.textSecondary }]} numberOfLines={1}>{issue.creatorName}</Text>
          </View>
          <View style={styles.upvoteRow}>
            <Ionicons name="thumbs-up" size={14} color={theme.primary} />
            <Text style={[styles.upvoteCount, { color: theme.textPrimary }]}>{issue.upvoteCount}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const { user, isDark, theme } = useApp();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sort, setSort] = useState('trending');
  const [filterCat, setFilterCat] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await firestoreService.getIssues(sort, filterCat);
      let filtered = data.filter(i =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.description.toLowerCase().includes(search.toLowerCase())
      );
      // Status filter
      if (filterStatus) {
        filtered = filtered.filter(i => i.status === filterStatus);
      }
      // Sort resolved to bottom (unless explicitly filtering for resolved)
      if (!filterStatus) {
        filtered.sort((a, b) => {
          if (a.status === 'resolved' && b.status !== 'resolved') return 1;
          if (a.status !== 'resolved' && b.status === 'resolved') return -1;
          return 0;
        });
      }
      setIssues(filtered);
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }, [sort, filterCat, filterStatus, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadIssues();
    setRefreshing(false);
  }, [loadIssues]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {!user && <GuestBanner />}
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search city issues..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Category Filter - Horizontally Scrollable */}
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {[{ id: undefined, name: 'All Reports' }, ...CATEGORIES].map(item => (
              <TouchableOpacity
                key={item.id || 'all'}
                style={[styles.filterChip, { backgroundColor: theme.card, borderColor: theme.border }, filterCat === item.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                onPress={() => setFilterCat(item.id)}
              >
                <Text style={[styles.filterChipText, { color: theme.textSecondary }, filterCat === item.id && { color: '#ffffff' }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Status Filter */}
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {[
              { id: undefined, name: 'All' },
              { id: 'open', name: 'Open' },
              { id: 'acknowledged', name: 'Acknowledged' },
              { id: 'resolved', name: 'Resolved' },
            ].map(item => (
              <TouchableOpacity
                key={item.id || 'all-status'}
                style={[styles.filterChip, { backgroundColor: theme.card, borderColor: theme.border }, filterStatus === item.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                onPress={() => setFilterStatus(item.id)}
              >
                <Text style={[styles.filterChipText, { color: theme.textSecondary }, filterStatus === item.id && { color: '#ffffff' }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Sort Row */}
        <View style={styles.sortRow}>
          <Text style={[styles.sortCount, { color: theme.textMuted }]}>{issues.length} {issues.length === 1 ? 'Report' : 'Reports'}</Text>
          <View style={styles.sortBtns}>
            {['trending', 'newest', 'upvoted'].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setSort(s)}
                style={[styles.sortBtn, sort === s && { backgroundColor: theme.primaryLight }]}
              >
                <Text style={[styles.sortBtnText, { color: theme.textMuted }, sort === s && { color: theme.primary }]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Issues List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>LOADING REPORTS...</Text>
          </View>
        ) : issues.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="search" size={48} color={theme.border} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>NO MATCHING RECORDS FOUND</Text>
          </View>
        ) : (
          <FlatList
            data={issues}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            renderItem={({ item }) => (
              <IssueCard
                issue={item}
                theme={theme}
                isDark={isDark}
                onPress={() => navigation.navigate('IssueDetail', { issueId: item.id })}
              />
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderWidth: 1,
  },
  searchIcon: { marginRight: SPACING.sm },
  searchInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 15 },

  filterContainer: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  filterScroll: { gap: SPACING.sm },
  filterChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round, borderWidth: 1,
  },
  filterChipText: { ...TYPOGRAPHY.caption, fontWeight: '700' },

  sortRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
  },
  sortCount: { ...TYPOGRAPHY.microLabel },
  sortBtns: { flexDirection: 'row', gap: 4 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BORDER_RADIUS.sm },
  sortBtnText: { ...TYPOGRAPHY.microLabel },

  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },

  card: {
    borderRadius: BORDER_RADIUS.xl, borderWidth: 1,
    overflow: 'hidden', ...SHADOWS.subtle,
  },
  cardImageWrap: { height: 180, position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  cardImageBadge: { position: 'absolute', top: 12, left: 12 },
  cardBody: { padding: 16 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardCategory: { ...TYPOGRAPHY.microLabel, flex: 1 },
  cardDate: { ...TYPOGRAPHY.caption },
  cardTitle: { ...TYPOGRAPHY.cardTitle, marginBottom: 6, lineHeight: 24 },
  cardDesc: { ...TYPOGRAPHY.body, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 12 },
  cardAuthor: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1 },
  avatarPlaceholder: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  authorName: { ...TYPOGRAPHY.caption, fontWeight: '700', maxWidth: 120 },
  upvoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upvoteCount: { ...TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BORDER_RADIUS.round },
  badgeText: { ...TYPOGRAPHY.microLabel, letterSpacing: 0.5 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...TYPOGRAPHY.microLabel, letterSpacing: 2 },
  emptyText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1.5 },
});
