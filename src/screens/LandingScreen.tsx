// src/screens/LandingScreen.tsx
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

type Nav = StackNavigationProp<RootStackParamList>;

export default function LandingScreen() {
  const { user, isDark, theme } = useApp();
  const navigation = useNavigation<Nav>();

  const FeatureCard = ({ icon, title, description }: { icon: any; title: string; description: string }) => (
    <View style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: theme.primaryLight }]}>
        <Ionicons name={icon} size={28} color={theme.primary} />
      </View>
      <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>{description}</Text>
    </View>
  );

  const StatItem = ({ value, label }: { value: string; label: string }) => (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: theme.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]}>
            <Ionicons name="shield-checkmark" size={14} color={theme.primary} />
            <Text style={[styles.badgeText, { color: theme.primary }]}>Community-Powered City Improvement</Text>
          </View>

          <Text style={[styles.heroTitle, { color: theme.primary }]}>CivicPulse</Text>
          <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
            Report issues in your city. Upvote what matters.{'\n'}Make your community better, together.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, ...SHADOWS.colored(theme.primary) }]}
            onPress={() => navigation.navigate('Main')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Browse Issues</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>

          {!user && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Login')}
            >
              <Ionicons name="person-outline" size={18} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Sign In / Join</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Features */}
        <View style={styles.features}>
          <FeatureCard
            icon="location"
            title="Report Issues"
            description="Snap a photo, pin the location, and submit. It takes less than a minute to inform the city."
          />
          <FeatureCard
            icon="trending-up"
            title="Prioritize Together"
            description="Upvote issues that affect you. The most critical concerns naturally rise to the top."
          />
          <FeatureCard
            icon="notifications"
            title="Track Progress"
            description="Follow reported issues and receive updates when the city acknowledges or resolves them."
          />
        </View>

        {/* Stats */}
        <View style={[styles.statsSection, { backgroundColor: isDark ? theme.card : '#f1f5f9' }]}>
          <StatItem value="150+" label="ISSUES REPORTED" />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <StatItem value="2.5K" label="COMMUNITY VOTES" />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <StatItem value="89%" label="RESOLUTION RATE" />
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <Text style={[styles.ctaTitle, { color: theme.textPrimary }]}>Ready to make a difference?</Text>
          <Text style={[styles.ctaDesc, { color: theme.textSecondary }]}>
            Join your neighbors in prioritizing urban infrastructure and building a safer community.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, ...SHADOWS.colored(theme.primary) }]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>
              {user ? 'Report Your First Issue' : 'Sign Up to Report Issues'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 40 },

  hero: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 24,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  heroTitle: {
    fontSize: 64, fontWeight: '900', letterSpacing: -2, marginBottom: 16, textAlign: 'center',
  },
  heroSub: {
    fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingHorizontal: 28, paddingVertical: 16,
    marginBottom: 12,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },

  features: { paddingHorizontal: 16, gap: 12, marginBottom: 32 },
  featureCard: {
    borderRadius: BORDER_RADIUS.xxl, borderWidth: 1,
    padding: 24, alignItems: 'center', ...SHADOWS.subtle,
  },
  featureIcon: {
    width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  featureTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  featureDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  statsSection: {
    flexDirection: 'row', marginHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xxl,
    justifyContent: 'space-around', alignItems: 'center', marginBottom: 40,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { ...TYPOGRAPHY.pageTitle, fontSize: 28, marginBottom: 4 },
  statLabel: { ...TYPOGRAPHY.microLabel, textAlign: 'center' },
  statDivider: { width: 1, height: 40 },

  cta: { paddingHorizontal: 24, alignItems: 'center' },
  ctaTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  ctaDesc: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
});
