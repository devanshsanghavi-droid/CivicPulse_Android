// src/screens/ReportScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, ActivityIndicator, SafeAreaView,
  KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import { useApp } from '../context/AppContext';
import { firestoreService } from '../services/firestoreService';
import { CATEGORIES } from '../constants';
import { useNavigation } from '@react-navigation/native';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type LocationTab = 'gps' | 'address' | 'pin';
const STEP_LABELS = ['Photos', 'Details', 'Location'];

export default function ReportScreen() {
  const { user, isDark, theme } = useApp();
  const navigation = useNavigation();
  const [currentStep, setCurrentStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  const [locationTab, setLocationTab] = useState<LocationTab>('gps');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [pinLocation, setPinLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinAddress, setPinAddress] = useState('');
  const [addressResult, setAddressResult] = useState<{ lat: number; lng: number; display: string } | null>(null);

  useEffect(() => { getLocation(); }, []);

  const getLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location Required', 'Please enable location access.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const geo = await Location.reverseGeocodeAsync(loc.coords);
      if (geo[0]) { const g = geo[0]; setAddress(`${g.streetNumber || ''} ${g.street || ''}, ${g.city || ''}, ${g.region || ''}`); }
    } catch (err) { console.warn('Location error:', err); }
    finally { setLocLoading(false); }
  };

  const pickPhoto = async () => {
    if (photos.length >= 3) { Alert.alert('Limit Reached', 'You can attach up to 3 photos.'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      const remaining = 3 - photos.length;
      setPhotos(prev => [...prev, ...result.assets.slice(0, remaining).map(a => a.uri)]);
    }
  };

  const takePhoto = async () => {
    if (photos.length >= 3) { Alert.alert('Limit Reached', 'You can attach up to 3 photos.'); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your camera.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8 });
    if (!result.canceled && result.assets[0]) { setPhotos(prev => [...prev, result.assets[0].uri]); }
  };

  const searchAddress = async () => {
    if (!addressQuery.trim()) return;
    setAddressSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery)}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const parsed = { lat: parseFloat(lat), lng: parseFloat(lon), display: display_name };
        setAddressResult(parsed);
        setLocation({ latitude: parsed.lat, longitude: parsed.lng });
        setAddress(parsed.display);
      } else { Alert.alert('Not Found', 'No results found.'); }
    } catch { Alert.alert('Error', 'Failed to search address.'); }
    finally { setAddressSearching(false); }
  };

  const handlePinDrop = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPinLocation({ latitude, longitude });
    setLocation({ latitude, longitude });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
      const data = await res.json();
      const addr = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setPinAddress(addr);
      setAddress(addr);
    } catch {
      const fallback = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setPinAddress(fallback);
      setAddress(fallback);
    }
  };

  const getEffectiveLocation = () => {
    switch (locationTab) {
      case 'gps': return location;
      case 'address': return addressResult ? { latitude: addressResult.lat, longitude: addressResult.lng } : null;
      case 'pin': return pinLocation;
    }
  };
  const getEffectiveAddress = () => {
    switch (locationTab) {
      case 'gps': return address;
      case 'address': return addressResult?.display || '';
      case 'pin': return pinAddress;
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Please enter a title.');
    if (!categoryId) return Alert.alert('Required', 'Please select a category.');
    const effectiveLoc = getEffectiveLocation();
    if (!effectiveLoc) return Alert.alert('Required', 'Location is required.');
    if (!user) return;

    setSubmitting(true);
    try {
      const issue = await firestoreService.createIssue({
        createdBy: user.id, creatorName: user.name, creatorPhotoURL: user.photoURL,
        title: title.trim(), description: description.trim(), categoryId,
        latitude: effectiveLoc.latitude, longitude: effectiveLoc.longitude,
        address: getEffectiveAddress(), photos: [],
      });
      await Promise.all(photos.map(async (uri, i) => ({ id: `photo_${i}`, url: await firestoreService.uploadPhoto(uri, issue.id) })));
      Alert.alert('Report Submitted! ✅', 'Your issue has been reported.', [{ text: 'View Feed', onPress: () => navigation.goBack() }]);
      setTitle(''); setDescription(''); setCategoryId(''); setPhotos([]); setCurrentStep(1);
    } catch (err: any) { Alert.alert('Submission Failed', err.message || 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  const renderStepIndicator = () => (
    <View style={[styles.stepIndicator, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      {[1, 2, 3].map((step, idx) => (
        <React.Fragment key={step}>
          <View style={styles.stepColumn}>
            <View style={[
              styles.stepCircle,
              currentStep === step && [styles.stepCircleActive, { backgroundColor: theme.primary, ...SHADOWS.colored(theme.primary) }],
              currentStep > step && [styles.stepCircleCompleted, { backgroundColor: theme.primary }],
              currentStep < step && [styles.stepCircleInactive, { borderColor: theme.textMuted }],
            ]}>
              {currentStep > step ? (
                <Ionicons name="checkmark" size={18} color="#ffffff" />
              ) : (
                <Text style={[styles.stepNumber, currentStep === step && styles.stepNumberActive, currentStep < step && { color: theme.textMuted }]}>{step}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, { color: theme.textMuted }, currentStep === step && { color: theme.primary }]}>{STEP_LABELS[idx]}</Text>
          </View>
          {step < 3 && <View style={[styles.stepLine, { backgroundColor: theme.border }, currentStep > step && { backgroundColor: theme.primary }]} />}
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {renderStepIndicator()}
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Add Photos</Text>
              <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>Take photos or select from your library to document the issue.</Text>
              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={i} style={styles.photoThumb}>
                    <Image source={{ uri }} style={styles.photoImg} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                      <Ionicons name="close-circle" size={20} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < 3 && (
                  <>
                    <TouchableOpacity style={[styles.photoAddBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={takePhoto}>
                      <Ionicons name="camera" size={24} color={theme.primary} />
                      <Text style={[styles.photoAddText, { color: theme.primary }]}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.photoAddBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={pickPhoto}>
                      <Ionicons name="image" size={24} color={theme.primary} />
                      <Text style={[styles.photoAddText, { color: theme.primary }]}>Library</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Issue Details</Text>
              <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>Provide details about the issue you're reporting.</Text>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>ISSUE TITLE</Text>
                <TextInput style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]} placeholder="e.g. Large pothole on Main St" placeholderTextColor={theme.textMuted} value={title} onChangeText={setTitle} maxLength={80} />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>CATEGORY</Text>
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat.id} style={[styles.categoryChip, { backgroundColor: theme.card, borderColor: theme.border }, categoryId === cat.id && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setCategoryId(cat.id)}>
                      <Text style={[styles.categoryText, { color: theme.textSecondary }, categoryId === cat.id && { color: '#ffffff' }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>DESCRIPTION (OPTIONAL)</Text>
                <TextInput style={[styles.input, styles.textArea, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]} placeholder="Describe the issue in detail..." placeholderTextColor={theme.textMuted} value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />
              </View>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Location</Text>
              <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>Choose how to set the issue location.</Text>
              <View style={styles.locTabs}>
                {([
                  { key: 'gps' as LocationTab, label: 'My Location', icon: 'navigate' as const },
                  { key: 'address' as LocationTab, label: 'Address', icon: 'search' as const },
                  { key: 'pin' as LocationTab, label: 'Pin Drop', icon: 'pin' as const },
                ]).map(t => (
                  <TouchableOpacity key={t.key} style={[styles.locTab, { backgroundColor: theme.card, borderColor: theme.border }, locationTab === t.key && { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={() => setLocationTab(t.key)}>
                    <Ionicons name={t.icon} size={14} color={locationTab === t.key ? theme.primary : theme.textMuted} />
                    <Text style={[styles.locTabText, { color: theme.textMuted }, locationTab === t.key && { color: theme.primary }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {locationTab === 'gps' && (
                <View style={styles.field}>
                  <TouchableOpacity style={[styles.locationBox, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={getLocation}>
                    {locLoading ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name={location ? "location" : "location-outline"} size={20} color={location ? theme.primary : theme.textMuted} />}
                    <Text style={[styles.locationText, { color: theme.textPrimary }, !location && { color: theme.textMuted }]}>
                      {location ? (address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`) : 'Tap to detect location'}
                    </Text>
                  </TouchableOpacity>
                  {location && (
                    <MapView style={styles.locMapPreview} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} userInterfaceStyle={isDark ? 'dark' : 'light'}
                      region={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
                      <Marker coordinate={location} pinColor={theme.primary} />
                    </MapView>
                  )}
                </View>
              )}

              {locationTab === 'address' && (
                <View style={styles.field}>
                  <View style={styles.addressRow}>
                    <TextInput style={[styles.input, { flex: 1, backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]} placeholder="Enter an address..." placeholderTextColor={theme.textMuted} value={addressQuery} onChangeText={setAddressQuery} onSubmitEditing={searchAddress} returnKeyType="search" />
                    <TouchableOpacity style={[styles.searchBtn, { backgroundColor: theme.primary }]} onPress={searchAddress} disabled={addressSearching}>
                      {addressSearching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                  {addressResult && (
                    <>
                      <Text style={[styles.resolvedAddress, { color: theme.textSecondary }]}>{addressResult.display}</Text>
                      <MapView style={styles.locMapPreview} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} userInterfaceStyle={isDark ? 'dark' : 'light'}
                        region={{ latitude: addressResult.lat, longitude: addressResult.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
                        <Marker coordinate={{ latitude: addressResult.lat, longitude: addressResult.lng }} pinColor={theme.primary} />
                      </MapView>
                    </>
                  )}
                </View>
              )}

              {locationTab === 'pin' && (
                <View style={styles.field}>
                  <Text style={[styles.pinHint, { color: theme.textMuted }]}>Tap anywhere on the map to place a pin</Text>
                  <MapView style={styles.locMapInteractive} onPress={handlePinDrop} userInterfaceStyle={isDark ? 'dark' : 'light'}
                    initialRegion={{ latitude: location?.latitude || 37.3861, longitude: location?.longitude || -122.0839, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
                    {pinLocation && <Marker coordinate={pinLocation} draggable onDragEnd={(e) => handlePinDrop(e as any)} pinColor={theme.primary} />}
                  </MapView>
                  {pinAddress ? <Text style={[styles.resolvedAddress, { color: theme.textSecondary }]}>{pinAddress}</Text> : null}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <View style={[styles.navigationButtons, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {currentStep > 1 && (
            <TouchableOpacity style={[styles.backBtn, { borderColor: theme.border }]} onPress={() => setCurrentStep(currentStep - 1)}>
              <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
              <Text style={[styles.backBtnText, { color: theme.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: theme.primary, ...SHADOWS.colored(theme.primary) }, currentStep === 3 && { backgroundColor: theme.success, ...SHADOWS.colored(theme.success) }]}
            onPress={currentStep === 3 ? handleSubmit : () => setCurrentStep(currentStep + 1)} disabled={submitting} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : (
              <>
                <Ionicons name={currentStep === 3 ? "send" : "chevron-forward"} size={18} color="#ffffff" />
                <Text style={styles.nextBtnText}>{currentStep === 3 ? 'SUBMIT REPORT' : 'Next'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: 120 },

  stepIndicator: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xxl, borderBottomWidth: 1 },
  stepColumn: { alignItems: 'center', width: 60 },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { width: 40, height: 40, borderRadius: 20 },
  stepCircleCompleted: {},
  stepCircleInactive: { backgroundColor: 'transparent', borderWidth: 2 },
  stepNumber: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  stepNumberActive: { color: '#ffffff', fontSize: 16 },
  stepLabel: { ...TYPOGRAPHY.microLabel, marginTop: SPACING.xs, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 18, marginHorizontal: SPACING.xs },

  stepContent: { paddingVertical: SPACING.lg },
  stepTitle: { ...TYPOGRAPHY.pageTitle, fontSize: 24, marginBottom: SPACING.sm, textAlign: 'center' },
  stepDescription: { ...TYPOGRAPHY.body, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 22 },

  field: { marginBottom: SPACING.xl },
  label: { ...TYPOGRAPHY.sectionLabel, marginBottom: SPACING.sm },
  input: { borderRadius: BORDER_RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, ...TYPOGRAPHY.body, fontSize: 15 },
  textArea: { minHeight: 100, paddingTop: SPACING.md },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  categoryChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.round, borderWidth: 1 },
  categoryText: { ...TYPOGRAPHY.caption, fontWeight: '700' },

  locTabs: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  locTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  locTabText: { ...TYPOGRAPHY.microLabel },

  locationBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  locationText: { ...TYPOGRAPHY.body, flex: 1 },

  locMapPreview: { width: '100%', height: 180, borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.md, overflow: 'hidden' },
  locMapInteractive: { width: '100%', height: 280, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden' },
  addressRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  searchBtn: { width: 44, height: 44, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  resolvedAddress: { ...TYPOGRAPHY.body, fontSize: 13, marginTop: SPACING.sm, lineHeight: 20 },
  pinHint: { ...TYPOGRAPHY.caption, textAlign: 'center', marginBottom: SPACING.sm },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between' },
  photoThumb: { width: '48%', height: 120, borderRadius: BORDER_RADIUS.md, position: 'relative', aspectRatio: 1 },
  photoImg: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS.md },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
  photoAddBtn: { width: '48%', height: 120, borderRadius: BORDER_RADIUS.md, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, aspectRatio: 1 },
  photoAddText: { ...TYPOGRAPHY.caption, fontWeight: '700' },

  navigationButtons: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: SPACING.lg, borderTopWidth: 1, gap: SPACING.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  backBtnText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md },
  nextBtnText: { ...TYPOGRAPHY.caption, fontWeight: '800', color: '#ffffff', letterSpacing: 1 },
});
