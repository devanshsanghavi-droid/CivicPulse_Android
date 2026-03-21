// src/screens/MapScreen.tsx
// Uses supercluster directly for reliable pin clustering (replaces react-native-map-clustering)
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import SuperCluster from 'supercluster';
import GeoViewport from '@mapbox/geo-viewport';
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Default map center
const DEFAULT_REGION: Region = {
  latitude: 37.3852,
  longitude: -122.1141,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// --- Clustering helpers (ported from react-native-map-clustering/helpers.js) ---

function calculateBBox(region: Region): [number, number, number, number] {
  const lngD = region.longitudeDelta < 0 ? region.longitudeDelta + 360 : region.longitudeDelta;
  return [
    region.longitude - lngD,
    region.latitude - region.latitudeDelta,
    region.longitude + lngD,
    region.latitude + region.latitudeDelta,
  ];
}

function getZoom(region: Region, bbox: [number, number, number, number], minZoom: number): number {
  if (region.longitudeDelta >= 40) return minZoom;
  const vp = GeoViewport.viewport(bbox, [SCREEN_W, SCREEN_H]);
  return vp.zoom;
}

function clusterSize(count: number) {
  if (count >= 50) return { outer: 84, inner: 64, font: 20 };
  if (count >= 25) return { outer: 78, inner: 58, font: 19 };
  if (count >= 15) return { outer: 72, inner: 54, font: 18 };
  if (count >= 10) return { outer: 66, inner: 50, font: 17 };
  if (count >= 8) return { outer: 60, inner: 46, font: 17 };
  if (count >= 4) return { outer: 54, inner: 40, font: 16 };
  return { outer: 48, inner: 36, font: 15 };
}

// --- Types ---

interface PointProperties {
  index: number;
  issueId: string;
}

type ClusterOrPoint = SuperCluster.ClusterFeature<SuperCluster.AnyProps> | SuperCluster.PointFeature<PointProperties>;

// --- Component ---

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { user, isDark, theme } = useApp();
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const toastRef = useRef<AuthPromptToastRef>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [displayedMarkers, setDisplayedMarkers] = useState<ClusterOrPoint[]>([]);

  // Build supercluster index whenever issues change
  const clusterIndex = useMemo(() => {
    const index = new SuperCluster({
      radius: 50,
      maxZoom: 20,
      minZoom: 1,
      minPoints: 2,
      extent: 512,
      nodeSize: 64,
    });

    const validIssues = issues.filter(i => i.latitude != null && i.longitude != null);
    const points: SuperCluster.PointFeature<PointProperties>[] = validIssues.map((issue, idx) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [issue.longitude!, issue.latitude!],
      },
      properties: { index: idx, issueId: issue.id },
    }));

    index.load(points);
    return index;
  }, [issues]);

  // Filtered issues for marker lookup
  const validIssues = useMemo(
    () => issues.filter(i => i.latitude != null && i.longitude != null),
    [issues]
  );

  // Recompute visible clusters whenever region or data changes
  const updateClusters = useCallback((reg: Region) => {
    const bbox = calculateBBox(reg);
    const zoom = getZoom(reg, bbox, 1);
    const clusters = clusterIndex.getClusters(bbox, zoom) as ClusterOrPoint[];
    setDisplayedMarkers(clusters);
  }, [clusterIndex]);

  // Recompute clusters when clusterIndex changes (new data)
  useEffect(() => {
    updateClusters(region);
  }, [clusterIndex]);

  useEffect(() => {
    const loadIssues = async () => {
      try {
        const data = await firestoreService.getIssues();
        setIssues(data);
      } catch (err) {
        console.error('Map: failed to load issues', err);
      } finally {
        setLoading(false);
      }
    };
    loadIssues();
    getUserLocation();
  }, []);

  const getUserLocation = async () => {
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
      setRegion(userRegion);
      mapRef.current?.animateToRegion(userRegion, 800);
    } catch {
      console.warn('Could not get user location');
    }
  };

  const handleRegionChange = useCallback((reg: Region) => {
    setRegion(reg);
    updateClusters(reg);
  }, [updateClusters]);

  const handleClusterPress = useCallback((clusterId: number) => {
    try {
      const leaves = clusterIndex.getLeaves(clusterId, Infinity);
      const coords = leaves.map(l => ({
        latitude: l.geometry.coordinates[1],
        longitude: l.geometry.coordinates[0],
      }));
      if (coords.length > 0) {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 50, left: 50, right: 50, bottom: 50 },
          animated: true,
        });
      }
    } catch {
      // Cluster no longer valid — ignore
    }
  }, [clusterIndex]);

  const overlayBg = isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)';
  const overlayBgLight = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        onRegionChangeComplete={handleRegionChange}
      >
        {displayedMarkers.map(marker => {
          const coords = {
            latitude: marker.geometry.coordinates[1],
            longitude: marker.geometry.coordinates[0],
          };

          // Cluster marker
          if (marker.properties && 'cluster' in marker.properties && marker.properties.cluster) {
            const count = marker.properties.point_count;
            const id = marker.properties.cluster_id;
            const sz = clusterSize(count);
            return (
              <Marker
                key={`cluster-${id}-${count}`}
                coordinate={coords}
                onPress={() => handleClusterPress(id)}
                tracksViewChanges={false}
              >
                <View style={[styles.clusterOuter, { width: sz.outer, height: sz.outer, borderRadius: sz.outer / 2 }]}>
                  <View style={[styles.clusterInner, { width: sz.inner, height: sz.inner, borderRadius: sz.inner / 2 }]}>
                    <Text style={[styles.clusterText, { fontSize: sz.font }]}>{count}</Text>
                  </View>
                </View>
              </Marker>
            );
          }

          // Individual pin
          const props = marker.properties as PointProperties;
          const issue = validIssues[props.index];
          if (!issue) return null;

          const color = theme[issue.status as 'open' | 'acknowledged' | 'resolved'] || theme.open;
          const category = CATEGORIES.find(c => c.id === issue.categoryId);

          return (
            <Marker
              key={`pin-${issue.id}`}
              coordinate={coords}
              pinColor={color}
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
        })}
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

  // Cluster markers
  clusterOuter: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterInner: {
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: {
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },

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
