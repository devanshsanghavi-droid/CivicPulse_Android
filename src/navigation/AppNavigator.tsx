// src/navigation/AppNavigator.tsx
// Replaces your web app's string-based screen routing (currentScreen state)
// with React Navigation's stack + bottom tab navigator.

import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../context/AppContext';

// Screens
import LandingScreen from '../screens/LandingScreen';
import FeedScreen from '../screens/FeedScreen';
import MapScreen from '../screens/MapScreen';
import ReportScreen from '../screens/ReportScreen';
import ProfileScreen from '../screens/ProfileScreen';
import IssueDetailScreen from '../screens/IssueDetailScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import LoginScreen from '../screens/LoginScreen';
import LocationExplanationScreen from '../screens/LocationExplanationScreen';
import UserProfileScreen from '../screens/UserProfileScreen';

// Type definitions for navigation
export type RootStackParamList = {
  Landing: undefined;
  Main: { screen?: 'Feed' | 'Map' | 'Report' | 'Profile' | 'Admin' };
  Login: undefined;
  IssueDetail: { issueId: string };
  UserProfile: { userId: string };
  LocationExplanation: { pendingScreen: 'Map' | 'Report' };
};

export type MainTabParamList = {
  Feed: undefined;
  Map: { focusIssueId?: string; latitude?: number; longitude?: number } | undefined;
  Report: undefined;
  Profile: undefined;
  Admin: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Guest pill button rendered in place of the Report tab for unauthenticated users
function GuestLoginTabButton() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  return (
    <View style={guestButtonStyles.wrapper}>
      <TouchableOpacity
        style={guestButtonStyles.pill}
        onPress={() => navigation.navigate('Login')}
        activeOpacity={0.8}
      >
        <Ionicons name="lock-closed" size={13} color="#ffffff" />
        <Text style={guestButtonStyles.label}>Log In</Text>
      </TouchableOpacity>
    </View>
  );
}

// Bottom Tab Navigator (shown after login)
function MainTabs() {
  const { user, isAdmin, theme } = useApp();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
          height: 62,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Feed') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Map') iconName = focused ? 'map' : 'map-outline';
          else if (route.name === 'Report') iconName = focused ? 'add-circle' : 'add-circle-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'Admin') iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Feed' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={{
          title: 'Report',
          tabBarButton: user ? undefined : (_props) => <GuestLoginTabButton />,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      {isAdmin && (
        <Tab.Screen name="Admin" component={AdminDashboardScreen} options={{ title: 'Admin' }} />
      )}
    </Tab.Navigator>
  );
}
// Loading screen while Firebase auth initializes
function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.loadingText}>Loading CivicPulse...</Text>
    </View>
  );
}

function useIssueDetailOptions() {
  const { theme } = useApp();
  return {
    headerShown: true,
    headerTitle: 'Issue Report',
    headerBackTitle: 'Back',
    headerTintColor: theme.primary,
    headerStyle: { backgroundColor: theme.background },
    headerTitleStyle: { fontWeight: '800' as const, fontSize: 16, color: theme.textPrimary },
  };
}

function useUserProfileOptions() {
  const { theme } = useApp();
  return {
    headerShown: true,
    headerTitle: 'Profile',
    headerBackTitle: 'Back',
    headerTintColor: theme.primary,
    headerStyle: { backgroundColor: theme.background },
    headerTitleStyle: { fontWeight: '800' as const, fontSize: 16, color: theme.textPrimary },
  };
}

// Root Navigator
export default function AppNavigator() {
  const { user, isAuthLoading } = useApp();
  const issueDetailOptions = useIssueDetailOptions();
  const userProfileOptions = useUserProfileOptions();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const prevUser = useRef<boolean>(!!user);

  // When auth state changes, reset navigation to the appropriate root screen.
  // This runs in AppNavigator (which never unmounts), so it's immune to the
  // race condition where LoginScreen's navigate() fires on a stale ref.
  useEffect(() => {
    if (isAuthLoading) return;
    const wasLoggedIn = prevUser.current;
    const isLoggedIn = !!user;
    prevUser.current = isLoggedIn;

    // Only reset when auth state actually changes
    if (wasLoggedIn === isLoggedIn) return;
    if (!navigationRef.isReady()) return;

    navigationRef.reset({
      index: 0,
      routes: [{ name: isLoggedIn ? 'Main' : 'Landing' }],
    });
  }, [user, isAuthLoading]);

  if (isAuthLoading) return <LoadingScreen />;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        key={user ? 'authed' : 'guest'}
        initialRouteName={user ? 'Main' : 'Landing'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Landing" component={LandingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="IssueDetail"
          component={IssueDetailScreen}
          options={issueDetailOptions}
        />
        <Stack.Screen
          name="UserProfile"
          component={UserProfileScreen}
          options={userProfileOptions}
        />
        <Stack.Screen
          name="LocationExplanation"
          component={LocationExplanationScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const guestButtonStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#2563eb',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    gap: 16,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 2,
  }
});
