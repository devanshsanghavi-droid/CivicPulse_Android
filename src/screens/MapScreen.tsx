// src/screens/MapScreen.tsx
// Plain MapView — every issue renders as an individual pin, always visible.
// No clustering, no zoom-based hiding. The marker list is memoized so
// unrelated parent re-renders (notification polling, ban checks, etc.) do
// not rebuild the Marker elements, which was causing pins to flicker/drop
// during active zoom gestures on iOS.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import MapView, { Marker, Callout, Region, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { firestoreService } from '../services/firestoreService';
import { Issue } from '../types';
import { CATEGORIES } from '../constants';
import { useApp } from '../context/AppContext';
import { RootStackParamList, MainTabParamList } from '../navigation/AppNavigator';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';
import GuestBanner from '../components/GuestBanner';
import AuthPromptToast, { AuthPromptToastRef } from '../components/AuthPromptToast';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  StackNavigationProp<RootStackParamList>
>;

const DEFAULT_REGION: Region = {
  latitude: 37.3852,
  longitude: -122.1141,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { user, isDark, theme } = useApp();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainTabParamList, 'Map'>>();
  const mapRef = useRef<MapView>(null);
  const markerRefs = useRef<Record<string, InstanceType<typeof Marker> | null>>({});
  const toastRef = useRef<AuthPromptToastRef>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  const { focusIssueId, latitude: focusLat, longitude: focusLon } = route.params ?? {};
  // NOTE: we deliberately do NOT hold the region in state. `initialRegion`
  // is only read once on mount, so storing it in state would cause extra
  // re-renders (and thus marker rebuilds) without moving the camera. The
  // camera is moved imperatively via `mapRef.animateToRegion` instead.

  const getUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      mapRef.current?.animateToRegion(userRegion, 800);
    } catch {
      console.warn('Could not get user location');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadIssues = async () => {
      try {
        const data = await firestoreService.getIssues();
        if (cancelled) return;
        setIssues(data);
      } catch (err) {
        console.error('Map: failed to load issues', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadIssues();
    // Skip auto-locate if we're focusing on a specific issue
    if (!focusIssueId) getUserLocation();
    return () => { cancelled = true; };
  }, [getUserLocation]);

  // When coming from "Expand Map", center on the issue and open its callout.
  // Re-runs when issues finish loading (issues.length changes 0 → N).
  useEffect(() => {
    if (!focusIssueId || focusLat == null || focusLon == null || issues.length === 0) return;
    const region: Region = {
      latitude: focusLat,
      longitude: focusLon,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    };
    const animateTimer = setTimeout(() => {
      mapRef.current?.animateToRegion(region, 600);
      // Open the callout after the animation settles
      setTimeout(() => {
        markerRefs.current[focusIssueId]?.showCallout();
      }, 700);
    }, 150);
    return () => clearTimeout(animateTimer);
  }, [focusIssueId, focusLat, focusLon, issues.length]);

  // Memoize the marker list so the heavy `issues.map(...)` only rebuilds
  // when the underlying data (or theme colors) actually change. This is
  // the core fix for the "pins flicker/disappear during zoom" bug: before
  // the memo, every AppContext tick (notification poll every 10s, ban
  // check, role sync, etc.) rebuilt every Marker element inline, which
  // react-native-maps interpreted as marker churn and would briefly drop
  // pins during active pan/zoom gestures.
  const markerElements = useMemo(() => {
    return issues
      .filter(issue => issue.latitude != null && issue.longitude != null)
      .map(issue => {
        const color = theme[issue.status as 'open' | 'acknowledged' | 'resolved'] || theme.open;
        const category = CATEGORIES.find(c => c.id === issue.categoryId);
        return (
          <Marker
            key={issue.id}
            ref={r => { markerRefs.current[issue.id] = r; }}
            identifier={issue.id}
            coordinate={{ latitude: issue.latitude!, longitude: issue.longitude! }}
            pinColor={color}
            // We use the default native pin (via pinColor) with a Callout
            // child. Telling the native map not to track view changes
            // prevents the re-render -> marker redraw -> flicker chain
            // when the parent re-renders.
            tracksViewChanges={false}
          >
            <Callout
              onPress={() => navigation.navigate('IssueDetail', { issueId: issue.id })}
              style={styles.callout}
            >
              <View style={styles.calloutInner}>
                <View style={styles.calloutStatusRow}>
                  <View style={[styles.calloutDot, { backgroundColor: color }]} />
                  <Text style={styles.calloutStatus}>{issue.status.toUpperCase()}</Text>
                </View>
                <Text style={[styles.calloutCategory, { color: theme.primary }]}>{category?.name}</Text>
                <Text style={styles.calloutTitle}>{issue.title}</Text>
                <Text style={styles.calloutCta}>Tap to view full report →</Text>
              </View>
            </Callout>
          </Marker>
        );
      });
  }, [issues, theme, navigation]);

  const overlayBg = isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)';
  const overlayBgLight = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        // No zoom limits — every pin is visible at every zoom level.
      >
        {/* Administrative boundary overlay from OSM — only active at regional
            zoom levels (6–12) so it fades away before street view kicks in. */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          minimumZ={6}
          maximumZ={12}
          opacity={0.22}
          zIndex={1}
        />
        {markerElements}
      </MapView>

      {/* Header pill */}
      <View style={[styles.headerPill, { backgroundColor: overlayBg, top: 16 + insets.top }]}>
        <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
        <Text style={[styles.headerText, { color: theme.textPrimary }]}>LIVE GEOSPATIAL FEED</Text>
      </View>

      {loading && (
        <View style={[styles.loadingOverlay, { backgroundColor: overlayBgLight, top: 60 + insets.top }]}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      )}

      {/* Legend */}
      <View style={[styles.legend, { backgroundColor: overlayBg }]}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: theme.open }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>ACTIVE INCIDENT</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: theme.resolved }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>RESOLVED STATE</Text>
        </View>
      </View>

      {/* My location button */}
      <TouchableOpacity style={[styles.locationBtn, { backgroundColor: theme.card }]} onPress={getUserLocation}>
        <Ionicons name="locate" size={22} color={theme.primary} />
      </TouchableOpacity>

      {/* Report FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary, ...SHADOWS.colored(theme.primary) }]}
        onPress={() => {
          if (!user) {
            toastRef.current?.show('Sign in to report a problem');
          } else {
            navigation.navigate('Main', { screen: 'Report' });
          }
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Guest banner */}
      {!user && <GuestBanner style={[styles.guestBanner, { top: 72 + insets.top }]} />}

      <AuthPromptToast ref={toastRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  headerPill: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.lg, paddingVertical: 10,
    ...SHADOWS.medium,
  },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  headerText: { ...TYPOGRAPHY.microLabel },

  loadingOverlay: {
    position: 'absolute', alignSelf: 'center',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.sm,
  },

  legend: {
    position: 'absolute', bottom: 100, left: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, gap: SPACING.sm,
    ...SHADOWS.subtle,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#ffffff' },
  legendText: { ...TYPOGRAPHY.microLabel },

  locationBtn: {
    position: 'absolute', bottom: 100, right: SPACING.lg,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.subtle,
  },

  fab: {
    position: 'absolute', bottom: SPACING.xxl, right: SPACING.lg,
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ffffff',
  },

  guestBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: 0,
  },

  callout: { width: 240 },
  calloutInner: { padding: SPACING.md },
  calloutStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  calloutDot: { width: 6, height: 6, borderRadius: 3 },
  calloutStatus: { ...TYPOGRAPHY.microLabel, color: '#9ca3af', letterSpacing: 1 },
  calloutCategory: { ...TYPOGRAPHY.caption, textTransform: 'uppercase', marginBottom: 4 },
  calloutTitle: { ...TYPOGRAPHY.body, fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 },
  calloutCta: { ...TYPOGRAPHY.caption, fontWeight: '700', color: '#9ca3af' },
});
