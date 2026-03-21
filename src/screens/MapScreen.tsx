// src/screens/MapScreen.tsx
// Plain MapView — every issue renders as an individual pin, always visible.
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
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
  const mapRef = useRef<MapView>(null);
  const toastRef = useRef<AuthPromptToastRef>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);

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
      >
        {issues
          .filter(issue => issue.latitude != null && issue.longitude != null)
          .map(issue => {
            const color = theme[issue.status as 'open' | 'acknowledged' | 'resolved'] || theme.open;
            const category = CATEGORIES.find(c => c.id === issue.categoryId);
            return (
              <Marker
                key={issue.id}
                coordinate={{ latitude: issue.latitude!, longitude: issue.longitude! }}
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
