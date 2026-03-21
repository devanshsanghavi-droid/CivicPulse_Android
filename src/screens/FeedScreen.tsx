// src/screens/FeedScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Image, SafeAreaView, RefreshControl, ScrollView, KeyboardAvoidingView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { firestoreService } from '../services/firestoreService';
import { distanceMiles } from '../services/storage';
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

const IssueCard = ({ issue, onPress, theme, isDark, distance }: { issue: Issue; onPress: () => void; theme: AppTheme; isDark: boolean; distance?: string }) => {
  const category = CATEGORIES.find(c => c.id === issue.categoryId);
  const photo = issue.photos?.[0]?.url;

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
          {distance && (
            <View style={[styles.distanceBadge, { backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' }]}>
              <Ionicons name="location" size={9} color={theme.primary} />
              <Text style={[styles.distanceText, { color: theme.primary }]}>{distance}</Text>
            </View>
          )}
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

/** Format distance for display */
const formatDistance = (miles: number): string => {
  if (miles < 0.1) return '<0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
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
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationFetched = useRef(false);

  // Request user location once on mount (silent — no blocking prompt)
  useEffect(() => {
    if (locationFetched.current) return;
    locationFetched.current = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch { /* location unavailable — trending works without it */ }
    })();
  }, []);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await firestoreService.getIssues(sort, filterCat, userLocation);
      let filtered = data.filter(i =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.description.toLowerCase().includes(search.toLowerCase())
      );
      // Status filter
      if (filterStatus) {
        filtered = filtered.filter(i => i.status === filterStatus);
      }
      // Sort resolved to bottom (unless explicitly filtering for resolved or sorting by nearby)
      if (!filterStatus && sort !== 'nearby') {
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
  }, [sort, filterCat, filterStatus, search, userLocation]);

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

        {/* Category Filter */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {[{ id: undefined, name: 'All' }, ...CATEGORIES].map(item => (
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

        {/* Status + Count + Sort — single compact row */}
        <View style={styles.controlRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlScroll}>
            {[
              { id: undefined, name: 'All' },
              { id: 'open', name: 'Open' },
              { id: 'acknowledged', name: 'Ack' },
              { id: 'resolved', name: 'Resolved' },
            ].map(item => (
              <TouchableOpacity
                key={item.id || 'all-status'}
                style={[styles.statusPill, { borderColor: theme.border }, filterStatus === item.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                onPress={() => setFilterStatus(item.id)}
              >
                <Text style={[styles.statusPillText, { color: theme.textMuted }, filterStatus === item.id && { color: '#ffffff' }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.sortDivider, { color: theme.border }]}>|</Text>
            {[
              { id: 'trending', label: 'Trending' },
              { id: 'nearby', label: 'Near Me' },
              { id: 'newest', label: 'Newest' },
              { id: 'upvoted', label: 'Upvoted' },
            ].map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => {
                  if (s.id === 'nearby' && !userLocation) {
                    // Re-request location if not available
                    (async () => {
                      try {
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        if (status !== 'granted') return;
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                      } catch { /* ignore */ }
                    })();
                  }
                  setSort(s.id);
                }}
                style={[styles.statusPill, { borderColor: theme.border }, sort === s.id && { backgroundColor: theme.primaryLight, borderColor: theme.primaryLight }]}
              >
                {s.id === 'nearby' && <Ionicons name="location" size={10} color={sort === s.id ? theme.primary : theme.textMuted} style={{ marginRight: 3 }} />}
                <Text style={[styles.statusPillText, { color: theme.textMuted }, sort === s.id && { color: theme.primary }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.sortCount, { color: theme.textMuted }]}>{issues.length}</Text>
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
            renderItem={({ item }) => {
              let dist: string | undefined;
              if (userLocation && item.latitude != null && item.longitude != null) {
                dist = formatDistance(distanceMiles(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude));
              }
              return (
                <IssueCard
                  issue={item}
                  theme={theme}
                  isDark={isDark}
                  distance={dist}
                  onPress={() => navigation.navigate('IssueDetail', { issueId: item.id })}
                />
              );
            }}
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
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderWidth: 1,
  },
  searchIcon: { marginRight: SPACING.sm },
  searchInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14 },

  filterContainer: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs },
  filterScroll: { gap: 6 },
  filterChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round, borderWidth: 1,
  },
  filterChipText: { fontSize: 11, fontWeight: '700' },

  controlRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs,
  },
  controlScroll: { gap: 6, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round, borderWidth: 1,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  sortDivider: { fontSize: 14, marginHorizontal: 4 },
  sortCount: { ...TYPOGRAPHY.microLabel, marginLeft: SPACING.sm },

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
  distanceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  distanceText: { fontSize: 10, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...TYPOGRAPHY.microLabel, letterSpacing: 2 },
  emptyText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1.5 },
});
