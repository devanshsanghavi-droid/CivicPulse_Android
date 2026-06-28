// src/screens/LocationExplanationScreen.tsx
// Full-screen, aggressive location permission gate.
// Rendered by AppNavigator BEFORE the NavigationContainer whenever the user
// has not granted foreground location permission yet. Does not use navigation
// hooks — it's a pure component that calls back to the parent.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Animated, Easing, Alert, Linking, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

interface LocationGateProps {
  onGranted: () => void;
  onSkipped: () => void;
}

type Stage = 'intro' | 'warning';

export default function LocationExplanationScreen({ onGranted, onSkipped }: LocationGateProps) {
  const [stage, setStage] = useState<Stage>('intro');
  const [requesting, setRequesting] = useState(false);

  // Subtle pulse animation on the icon
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.0] });

  const handleEnable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === 'granted') {
        onGranted();
        return;
      }
      // If permission is permanently denied, the OS won't show the prompt again.
      // Deep-link the user to Settings instead.
      if (!current.canAskAgain) {
        Alert.alert(
          'Enable Location in Settings',
          'Location access is turned off for CivicPulse. Open Settings and enable location to unlock the map, nearby issues, and accurate reporting.',
          [
            { text: 'Not Now', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch(() => {
                  Alert.alert('Unable to Open Settings', 'Please open the Settings app manually and enable location for CivicPulse.');
                });
              },
            },
          ],
        );
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        onGranted();
      }
      // If the user denied in the system dialog, we stay on the gate — they
      // can try again or choose "Continue without location" below.
    } catch {
      Alert.alert('Something went wrong', 'We couldn\'t request location permission. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const handleSkipPress = () => setStage('warning');
  const handleConfirmSkip = () => onSkipped();
  const handleBackToIntro = () => setStage('intro');

  if (stage === 'warning') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.warningContainer}>
          <View style={styles.warningIconWrap}>
            <Ionicons name="warning" size={42} color="#d97706" />
          </View>
          <Text style={styles.warningTitle}>Your experience will be limited</Text>
          <Text style={styles.warningBody}>
            Without location access, CivicPulse can&apos;t:
          </Text>
          <View style={styles.warningList}>
            <WarningRow text="Show you issues near your current location on the map" />
            <WarningRow text="Sort and filter the feed by what's actually around you" />
            <WarningRow text="Tag your reports with an accurate location for city crews" />
          </View>
          <Text style={styles.warningFooter}>
            You can still browse everything, but the experience will feel significantly degraded. You can turn location on later in Settings.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleBackToIntro}
            activeOpacity={0.85}
          >
            <Ionicons name="location" size={18} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Enable Location Instead</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipLink} onPress={handleConfirmSkip} activeOpacity={0.6}>
            <Text style={styles.skipLinkText}>Continue anyway</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1e3a8a', '#2563eb', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <SafeAreaView style={styles.heroSafe}>
          <View style={styles.iconStack}>
            <Animated.View
              style={[
                styles.iconPulse,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <View style={styles.iconWrap}>
              <Ionicons name="location-sharp" size={56} color="#ffffff" />
            </View>
          </View>
          <Text style={styles.heroTitle}>CivicPulse works best with location</Text>
          <Text style={styles.heroSub}>
            We&apos;re a hyperlocal civic app. Without your location, the core features don&apos;t work the way they should.
          </Text>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <FeatureRow
          icon="map"
          title="Live map of nearby issues"
          desc="See potholes, broken streetlights, and reports pinned around you in real time."
        />
        <FeatureRow
          icon="compass"
          title="A feed tuned to your area"
          desc="Prioritize issues on your block, not on the other side of town."
        />
        <FeatureRow
          icon="camera"
          title="Accurate one-tap reporting"
          desc="Your report is auto-tagged with the exact spot so city crews can find it."
        />

        <TouchableOpacity
          style={[styles.primaryBtn, requesting && styles.primaryBtnDisabled]}
          onPress={handleEnable}
          activeOpacity={0.85}
          disabled={requesting}
        >
          <Ionicons name="location" size={18} color="#ffffff" />
          <Text style={styles.primaryBtnText}>
            {requesting ? 'Requesting…' : 'Enable Location'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipLink} onPress={handleSkipPress} activeOpacity={0.6}>
          <Text style={styles.skipLinkText}>Continue without location</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function FeatureRow({ icon, title, desc }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIconWrap}>
        <Ionicons name={icon} size={20} color="#2563eb" />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function WarningRow({ text }: { text: string }) {
  return (
    <View style={styles.warningRow}>
      <Ionicons name="close-circle" size={16} color="#dc2626" style={{ marginTop: 2 }} />
      <Text style={styles.warningRowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },

  // Hero
  hero: {
    paddingBottom: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroSafe: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: Platform.OS === 'android' ? 36 : 12,
  },
  iconStack: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  iconPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
  },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },

  // Body
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, paddingTop: 2 },
  featureTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },

  // Buttons
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2563eb',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  skipLink: {
    marginTop: 18,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipLinkText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Warning stage
  safe: { flex: 1, backgroundColor: '#ffffff' },
  warningContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  warningBody: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 14,
  },
  warningList: {
    width: '100%',
    gap: 10,
    marginBottom: 18,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  warningRowText: {
    flex: 1,
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 18,
  },
  warningFooter: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
});
