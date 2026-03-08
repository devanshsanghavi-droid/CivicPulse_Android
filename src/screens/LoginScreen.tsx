// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
  TextInput, Image, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../services/firebaseAuth';
import { RootStackParamList } from '../navigation/AppNavigator';
import { SplineBackground } from '../components/SplineBackground';
import { TYPOGRAPHY, BORDER_RADIUS } from '../styles/designSystem';

type Nav = StackNavigationProp<RootStackParamList>;

// Official Google "G" logo as base64 SVG data URI
const GOOGLE_LOGO_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBmaWxsPSIjNDI4NUY0IiBkPSJNMjIuNTYgMTIuMjVjMC0uNzgtLjA3LTEuNTMtLjItMi4yNUgxMnY0LjI2aDUuOTJjLS4yNiAxLjM3LTEuMDQgMi41My0yLjIxIDMuMzF2Mi43N2gzLjU3YzIuMDgtMS45MiAzLjI4LTQuNzQgMy4yOC04LjA5eiIvPjxwYXRoIGZpbGw9IiMzNEE4NTMiIGQ9Ik0xMiAyM2MyLjk3IDAgNS40Ni0uOTggNy4yOC0yLjY2bC0zLjU3LTIuNzdjLS45OC42Ni0yLjIzIDEuMDYtMy43MSAxLjA2LTIuODYgMC01LjI5LTEuOTMtNi4xNi00LjUzSDIuMTh2Mi44NEMzLjk5IDIwLjUzIDcuNyAyMyAxMiAyM3oiLz48cGF0aCBmaWxsPSIjRkJCQzA1IiBkPSJNNS44NCAxNC4wOWMtLjIyLS42Ni0uMzUtMS4zNi0uMzUtMi4wOXMuMTMtMS40My4zNS0yLjA5VjcuMDdIMi4xOEMxLjQzIDguNTUgMSAxMC4yMiAxIDEycy40MyAzLjQ1IDEuMTggNC45M2wyLjg1LTIuMjIuODEtLjYyeiIvPjxwYXRoIGZpbGw9IiNFQTQzMzUiIGQ9Ik0xMiA1LjM4YzEuNjIgMCAzLjA2LjU2IDQuMjEgMS42NGwzLjE1LTMuMTVDMTcuNDUgMi4wOSAxNC45NyAxIDEyIDFjLTQuMyAwLTcuOTkgMi40Ny05LjgyIDYuMDdsMy42NiAyLjg0Yy44Ny0yLjYgMy4zLTQuNTMgNi4xNi00LjUzeiIvPjwvc3ZnPg==';

export default function LoginScreen() {
  const { setUser } = useApp();
  const navigation = useNavigation<Nav>();
  const [isLoading, setIsLoading] = useState(false);

  // Email auth state
  const [emailMode, setEmailMode] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const user = await signInWithGoogle();
      await setUser(user);
    } catch (err: any) {
      Alert.alert('Sign-In Failed', err.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    if (isSignUp) {
      if (!name.trim()) {
        Alert.alert('Missing Fields', 'Please enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Password Mismatch', 'Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Weak Password', 'Password must be at least 6 characters.');
        return;
      }
    }

    setIsLoading(true);
    try {
      const user = isSignUp
        ? await signUpWithEmail(email.trim(), password, name.trim())
        : await signInWithEmail(email.trim(), password);
      await setUser(user);
    } catch (err: any) {
      Alert.alert(isSignUp ? 'Sign-Up Failed' : 'Sign-In Failed', err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.splineContainer}>
        <SplineBackground />
      </View>

      <LinearGradient
        colors={['#000000', '#000000cc', '#00000000']}
        style={styles.gradient}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={styles.logoContainer}>
              <Text style={styles.appName}>
                Civic<Text style={styles.appPulse}>Pulse</Text>
              </Text>
              <Text style={styles.citySub}>
                Community Platform
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {emailMode ? (isSignUp ? 'Create account' : 'Welcome back') : 'Welcome back'}
              </Text>
              <Text style={styles.cardSub}>
                Sign in to report and track issues in your community
              </Text>

              {/* Google Sign In button */}
              {!emailMode && (
                <TouchableOpacity
                  onPress={handleGoogleSignIn}
                  style={[styles.googleBtn, isLoading && styles.btnDisabled]}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#111827" />
                  ) : (
                    <>
                      <Image
                        source={{ uri: GOOGLE_LOGO_URI }}
                        style={styles.googleLogo}
                        resizeMode="contain"
                      />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* OR divider */}
              {!emailMode && (
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
              )}

              {/* Email toggle button or email form */}
              {!emailMode ? (
                <TouchableOpacity
                  onPress={() => setEmailMode(true)}
                  style={styles.emailToggleBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mail-outline" size={18} color="#94a3b8" />
                  <Text style={styles.emailToggleText}>Continue with Email</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  {isSignUp && (
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={16} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Full name"
                        placeholderTextColor="#64748b"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                    </View>
                  )}

                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={16} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Email address"
                      placeholderTextColor="#64748b"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={16} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Password"
                      placeholderTextColor="#64748b"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      returnKeyType={isSignUp ? "next" : "done"}
                      onSubmitEditing={isSignUp ? undefined : handleEmailAuth}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {isSignUp && (
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={16} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Confirm password"
                        placeholderTextColor="#64748b"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleEmailAuth}
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleEmailAuth}
                    style={[styles.emailSubmitBtn, isLoading && styles.btnDisabled]}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.emailSubmitText}>
                        {isSignUp ? 'Create Account' : 'Sign In'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>
                      {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    </Text>
                    <TouchableOpacity onPress={() => { setIsSignUp(v => !v); setPassword(''); setConfirmPassword(''); }}>
                      <Text style={styles.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => { setEmailMode(false); setIsSignUp(false); setEmail(''); setPassword(''); setConfirmPassword(''); setName(''); }} style={styles.backToOptions}>
                    <Ionicons name="chevron-back" size={14} color="#64748b" />
                    <Text style={styles.backToOptionsText}>Other sign-in options</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Landing')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>RETURN TO HUB</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  splineContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    zIndex: 1,
  },
  safe: {
    flex: 1,
    zIndex: 2,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
  },
  logoContainer: {
    marginBottom: 40,
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  appPulse: {
    color: '#3b82f6',
  },
  citySub: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 14,
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 24,
    padding: 32,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  cardSub: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 24,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 22,
    height: 22,
  },
  googleBtnText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  dividerText: {
    color: '#475569',
    fontSize: 13,
  },
  emailToggleBtn: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emailToggleText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 15,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  emailSubmitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  emailSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  switchLabel: {
    color: '#64748b',
    fontSize: 13,
  },
  switchLink: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  backToOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 4,
  },
  backToOptionsText: {
    color: '#64748b',
    fontSize: 13,
  },
  backBtn: {
    marginTop: 24,
    alignSelf: 'center',
  },
  backBtnText: {
    ...TYPOGRAPHY.microLabel,
    color: '#94a3b8',
    textDecorationLine: 'underline',
  },
});
