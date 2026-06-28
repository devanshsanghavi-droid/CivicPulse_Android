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

const getCity = (address?: string): string => address?.split(',')[1]?.trim() ?? '';

const IssueCard = ({ issue, onPress, onAuthorPress, theme, isDark, distance }: { issue: Issue; onPress: () => void; onAuthorPress: () => void; theme: AppTheme; isDark: boolean; distance?: string }) => {
  const category = CATEGORIES.find(c => c.id === issue.categoryId);
  const photo = issue.photos?.[0]?.url;
  const city = getCity(issue.address);

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
          <TouchableOpacity style={styles.cardAuthor} onPress={onAuthorPress} activeOpacity={0.7}>
            {issue.creatorPhotoURL ? (
              <Image source={{ uri: issue.creatorPhotoURL }} style={[styles.avatar, { borderColor: theme.border }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.border }]}>
                <Ionicons name="person" size={12} color={theme.textMuted} />
              </View>
            )}
            <Text style={[styles.authorName, { color: theme.primary }]} numberOfLines={1}>{issue.creatorName}</Text>
          </TouchableOpacity>
          {city ? (
            <View style={styles.cityChip}>
              <Ionicons name="location-outline" size={10} color={theme.textMuted} />
              <Text style={[styles.cityChipText, { color: theme.textMuted }]} numberOfLines={1}>{city}</Text>
            </View>
          ) : null}
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
  const { user, isDark, theme, feedRefreshToken } = useApp();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sort, setSort] = useState('trending');
  const [filterCat, setFilterCat] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationFetched = useRef(false);
  const hasActiveFilters = !!filterCat || !!filterStatus;

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
  }, [sort, filterCat, filterStatus, search, userLocation, feedRefreshToken]);

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
        {/* Search + Filter Toggle */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="search" size={17} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search issues..."
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity
              onPress={() => setShowCategories(!showCategories)}
              style={[styles.filterToggle, hasActiveFilters && { backgroundColor: theme.primaryLight }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="options-outline" size={18} color={hasActiveFilters ? theme.primary : theme.textMuted} />
              {hasActiveFilters && <View style={[styles.filterDot, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          </View>
          <Text style={[styles.issueCount, { color: theme.textMuted }]}>{issues.length}</Text>
        </View>

        {/* Sort + Status — single row */}
        <View style={styles.controlRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlScroll}>
            {[
              { id: 'trending', label: 'Trending', icon: 'flame-outline' as const },
              { id: 'nearby', label: 'Near Me', icon: 'location-outline' as const },
              { id: 'newest', label: 'New', icon: 'time-outline' as const },
              { id: 'upvoted', label: 'Top', icon: 'thumbs-up-outline' as const },
            ].map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => {
                  if (s.id === 'nearby' && !userLocation) {
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
                style={[styles.sortPill, sort === s.id && { backgroundColor: theme.primary }]}
              >
                <Ionicons name={s.icon} size={14} color={sort === s.id ? '#ffffff' : theme.textMuted} />
                <Text style={[styles.sortPillText, { color: theme.textMuted }, sort === s.id && { color: '#ffffff' }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />
            {[
              { id: undefined, name: 'All' },
              { id: 'open', name: 'Open' },
              { id: 'acknowledged', name: 'Ack' },
              { id: 'resolved', name: 'Done' },
            ].map(item => (
              <TouchableOpacity
                key={item.id || 'all-status'}
                style={[styles.statusPill, filterStatus === item.id && { backgroundColor: theme.textPrimary }]}
                onPress={() => setFilterStatus(item.id)}
              >
                <Text style={[styles.statusPillText, { color: theme.textMuted }, filterStatus === item.id && { color: isDark ? '#000000' : '#ffffff' }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Collapsible Category Filter */}
        {showCategories && (
          <View style={styles.categoryRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              {[{ id: undefined, name: 'All Categories' }, ...CATEGORIES].map(item => (
                <TouchableOpacity
                  key={item.id || 'all'}
                  style={[styles.categoryChip, { borderColor: theme.border }, filterCat === item.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={() => setFilterCat(item.id)}
                >
                  <Text style={[styles.categoryChipText, { color: theme.textSecondary }, filterCat === item.id && { color: '#ffffff' }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

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
                  onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.createdBy })}
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

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: 2,
  },
  searchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.md, paddingVertical: 9,
    borderWidth: 1,
  },
  searchInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14, paddingVertical: 0 },
  filterToggle: { padding: 6, borderRadius: 8, position: 'relative' },
  filterDot: { position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3 },
  issueCount: { fontSize: 12, fontWeight: '800', minWidth: 20, textAlign: 'center' },

  controlRow: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs + 2,
  },
  controlScroll: { gap: 6, alignItems: 'center' },
  sortPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
  },
  sortPillText: { fontSize: 13, fontWeight: '700' },
  pillDivider: { width: 1, height: 18, marginHorizontal: 6 },
  statusPill: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
  },
  statusPillText: { fontSize: 13, fontWeight: '700' },

  categoryRow: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xs },
  categoryScroll: { gap: 6 },
  categoryChip: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round, borderWidth: 1,
  },
  categoryChipText: { fontSize: 11, fontWeight: '700' },

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
  cityChip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 100 },
  cityChipText: { fontSize: 11, fontWeight: '600' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...TYPOGRAPHY.microLabel, letterSpacing: 2 },
  emptyText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1.5 },
});
