// src/components/AuthPromptToast.tsx
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

export interface AuthPromptToastRef {
  show: (message: string) => void;
}

const AuthPromptToast = forwardRef<AuthPromptToastRef, {}>((props, ref) => {
  const { isDark } = useApp();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const hide = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  };

  useImperativeHandle(ref, () => ({
    show: (msg: string) => {
      // Clear any pending auto-dismiss
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      setMessage(msg);
      setVisible(true);

      // Reset animation values before animating in
      opacity.setValue(0);
      translateY.setValue(20);

      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }),
      ]).start();

      dismissTimer.current = setTimeout(() => {
        hide();
      }, 3000);
    },
  }));

  if (!visible) return null;

  const bgColor = isDark ? '#1f2937' : '#111827';

  return (
    <Animated.View
      style={[
        styles.toast,
        SHADOWS.strong,
        { backgroundColor: bgColor, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={() => {
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          hide();
          navigation.navigate('Login');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="lock-closed" size={16} color="#ffffff" />
        <Text style={styles.messageText} numberOfLines={2}>
          {message}
        </Text>
        <Text style={styles.signInSuffix}>Sign In →</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

AuthPromptToast.displayName = 'AuthPromptToast';

export default AuthPromptToast;

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: SPACING.lg,
    right: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  messageText: {
    ...TYPOGRAPHY.body,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  signInSuffix: {
    ...TYPOGRAPHY.body,
    color: '#60a5fa',
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 0,
  },
});
