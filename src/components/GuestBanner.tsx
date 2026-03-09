// src/components/GuestBanner.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, StyleProp, ViewStyle
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';
import { RootStackParamList } from '../navigation/AppNavigator';

interface GuestBannerProps {
  style?: StyleProp<ViewStyle>;
}

export default function GuestBanner({ style }: GuestBannerProps) {
  const { user } = useApp();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user || dismissed) return;

    const timer = setTimeout(() => {
      setVisible(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }, 5000);

    return () => clearTimeout(timer);
  }, [user, dismissed]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDismissed(true);
      setVisible(false);
    });
  };

  if (!visible || user || dismissed) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        SHADOWS.colored('#2563eb'),
        { transform: [{ translateY }], opacity },
        style,
      ]}
    >
      <View style={styles.content}>
        <Ionicons name="megaphone-outline" size={18} color="#ffffff" style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>
          Sign in to report problems in your community
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} activeOpacity={0.7} style={styles.dismissBtn}>
          <Ionicons name="close" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#2563eb',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    ...TYPOGRAPHY.body,
    color: '#ffffff',
    fontWeight: '600',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 0,
  },
  signInBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
  },
  signInText: {
    ...TYPOGRAPHY.caption,
    color: '#2563eb',
    fontWeight: '800',
    fontSize: 12,
  },
  dismissBtn: {
    padding: 2,
  },
});
