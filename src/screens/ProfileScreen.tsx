// src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Switch, Alert, SafeAreaView, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { signOutUser } from '../services/firebaseAuth';
import { storageService } from '../services/storage';
import { firestoreService } from '../services/firestoreService';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

type Nav = StackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { user, setUser, isDark, toggleDarkMode, theme } = useApp();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState({ reportCount: 0, upvoteCount: 0 });

  useEffect(() => {
    if (user) {
      firestoreService.getUserStats(user.id).then(setStats).catch(console.error);
    }
  }, [user]);

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
