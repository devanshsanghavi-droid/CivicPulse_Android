// src/screens/IssueDetailScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, TextInput, ActivityIndicator,
  Alert, SafeAreaView, KeyboardAvoidingView, Platform,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent, Modal,
  StatusBar, Share
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { firestoreService } from '../services/firestoreService';
import { storageService } from '../services/storage';
import { Issue, Comment } from '../types';
import { CATEGORIES } from '../constants';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';
import AuthPromptToast, { AuthPromptToastRef } from '../components/AuthPromptToast';

type RouteType = RouteProp<RootStackParamList, 'IssueDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_LIGHT: Record<string, { bg: string; text: string; marker: string }> = {
  open: { bg: '#fee2e2', text: '#dc2626', marker: '#2563eb' },
  acknowledged: { bg: '#fef3c7', text: '#d97706', marker: '#d97706' },
  resolved: { bg: '#dcfce7', text: '#16a34a', marker: '#16a34a' },
};
const STATUS_DARK: Record<string, { bg: string; text: string; marker: string }> = {
  open: { bg: '#7f1d1d', text: '#fca5a5', marker: '#3b82f6' },
  acknowledged: { bg: '#78350f', text: '#fcd34d', marker: '#f59e0b' },
  resolved: { bg: '#14532d', text: '#86efac', marker: '#22c55e' },
};

export default function IssueDetailScreen() {
  const { user, isDark, theme } = useApp();
  const route = useRoute<RouteType>();
  const navigation = useNavigation<any>();
  const { issueId } = route.params;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commenting, setCommenting] = useState(false);
  const [upvoting, setUpvoting] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [upvoters, setUpvoters] = useState<{ userId: string; userName?: string; userPhotoURL?: string }[]>([]);
  const toastRef = useRef<AuthPromptToastRef>(null);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const [issueData, commentsData] = await Promise.all([
          firestoreService.getIssue(issueId),
          firestoreService.getComments(issueId),
        ]);
        if (cancelled) return;
        setIssue(issueData);
        setComments(commentsData);
        if (user) {
          const upvoted = await storageService.hasUpvoted(issueId, user.id);
          if (!cancelled) setHasUpvoted(upvoted);
          // Load upvoters if current user is the creator
          if (issueData && issueData.createdBy === user.id) {
            const voters = await firestoreService.getUpvoters(issueId);
            if (!cancelled) setUpvoters(voters);
          }
        }
      } catch (err) { console.error('IssueDetail load error:', err); }
      finally { if (!cancelled) setLoading(false); }
    };
    loadData();
    return () => { cancelled = true; };
  }, [issueId]);

  const handleUpvote = async () => {
    if (!user) {
      toastRef.current?.show('Sign in to upvote this report');
      return;
    }
    if (!issue || upvoting) return;
    setUpvoting(true);
    try {
      const result = await storageService.toggleUpvote(issueId, user.id);
      const isAdding = result === 'added';
      await firestoreService.toggleUpvote(issueId, user.id, isAdding, user.name, user.photoURL);
      setHasUpvoted(isAdding);
      setIssue(prev => prev ? { ...prev, upvoteCount: prev.upvoteCount + (isAdding ? 1 : -1) } : prev);
      // Update upvoters list if creator is viewing
      if (issue && issue.createdBy === user.id) {
        if (isAdding) {
          setUpvoters(prev => [...prev, { userId: user.id, userName: user.name, userPhotoURL: user.photoURL }]);
        } else {
          setUpvoters(prev => prev.filter(v => v.userId !== user.id));
        }
      }
    } catch { Alert.alert('Error', 'Failed to update upvote.'); }
    finally { setUpvoting(false); }
  };

  const handleComment = async () => {
    if (!user || !newComment.trim() || commenting) return;
    setCommenting(true);
    try {
      const comment = await firestoreService.addComment(issueId, user.id, user.name, user.photoURL || '', newComment.trim());
      setComments(prev => [comment, ...prev]);
      setNewComment('');
    } catch { Alert.alert('Error', 'Failed to post comment.'); }
    finally { setCommenting(false); }
  };

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  const handleSubmitResolution = async () => {
    if (!user || !issue || submittingSuggestion) return;
    setSubmittingSuggestion(true);
    try {
      await firestoreService.submitResolutionSuggestion({
        issueId: issue.id,
        issueTitle: issue.title,
        suggestedBy: user.id,
        suggestedByName: user.name,
        suggestedByPhotoURL: user.photoURL || '',
        reason: resolveReason.trim() || undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setShowResolveModal(false);
      setResolveReason('');
      Alert.alert('Submitted', 'Your resolution suggestion has been submitted for admin review.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit suggestion.');
    } finally {
      setSubmittingSuggestion(false);
    }
  };

  const handleSavePhoto = async (url: string) => {
    setSavingPhoto(true);
    try {
      await Share.share({ url, message: url });
    } catch { /* user cancelled share — not an error */ }
    finally { setSavingPhoto(false); }
  };

  const handleExpandMap = () => {
    if (!issue) return;
    navigation.navigate('Main', { screen: 'Map', params: { focusIssueId: issue.id, latitude: issue.latitude, longitude: issue.longitude } });
  };

  if (loading) return <View style={[styles.centered, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={theme.primary} /></View>;
  if (!issue) return <View style={[styles.centered, { backgroundColor: theme.background }]}><Text style={[styles.errorText, { color: theme.textMuted }]}>Issue not found.</Text></View>;

  const category = CATEGORIES.find(c => c.id === issue.categoryId);
  const sc = (isDark ? STATUS_DARK : STATUS_LIGHT)[issue.status] || (isDark ? STATUS_DARK : STATUS_LIGHT).open;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {issue.photos?.length > 0 && (
            <View style={styles.photoContainer}>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photoScroll} onScroll={handlePhotoScroll} scrollEventThrottle={16}>
                {issue.photos.map((photo) => (
                  <TouchableOpacity key={photo.id} activeOpacity={0.9} onPress={() => setFullscreenPhoto(photo.url)}>
                    <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {issue.photos.length > 1 && (
                <View style={styles.pageIndicators}>
                  {issue.photos.map((_, index) => (
                    <View key={index} style={[styles.pageDot, activePhotoIndex === index ? [styles.activeDot, { backgroundColor: theme.primary }] : [styles.inactiveDot, { backgroundColor: theme.textMuted }]]} />
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.body}>
            <View style={styles.metaRow}>
              <Text style={[styles.category, { color: theme.primary }]}>{category?.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                <Text style={[styles.statusText, { color: sc.text }]}>{issue.status.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={[styles.title, { color: theme.textPrimary }]}>{issue.title}</Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>{issue.description}</Text>

            {issue.statusNote && (
              <View style={[styles.statusNote, { backgroundColor: theme.primaryLight, borderLeftColor: theme.primary }]}>
                <Ionicons name="information-circle" size={16} color={theme.primary} />
                <Text style={[styles.statusNoteText, { color: theme.primary }]}>{issue.statusNote}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.reporterRow} onPress={() => navigation.navigate('UserProfile', { userId: issue.createdBy })} activeOpacity={0.7}>
              {issue.creatorPhotoURL ? (
                <Image source={{ uri: issue.creatorPhotoURL }} style={styles.reporterAvatar} />
              ) : (
                <View style={[styles.reporterAvatarPlaceholder, { backgroundColor: theme.border }]}>
                  <Ionicons name="person" size={14} color={theme.textMuted} />
                </View>
              )}
              <Text style={[styles.reporterName, { color: theme.primary }]}>{issue.creatorName}</Text>
              <Text style={[styles.reporterDate, { color: theme.textMuted }]}>
                {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>

            {issue.latitude != null && issue.longitude != null && (
              <View style={styles.mapSection}>
                <MapView style={styles.mapPreview} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
                  initialRegion={{ latitude: issue.latitude, longitude: issue.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
                  <Marker coordinate={{ latitude: issue.latitude, longitude: issue.longitude }} pinColor={sc.marker} />
                </MapView>
                {issue.address && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={theme.primary} />
                    <Text style={[styles.locationText, { color: theme.textSecondary }]}>{issue.address}</Text>
                  </View>
                )}
                <TouchableOpacity style={[styles.expandMapBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={handleExpandMap} activeOpacity={0.8}>
                  <Ionicons name="expand-outline" size={16} color={theme.primary} />
                  <Text style={[styles.expandMapText, { color: theme.primary }]}>Expand Map</Text>
                </TouchableOpacity>
              </View>
            )}

            {(issue.latitude == null || issue.longitude == null) && issue.address && (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color={theme.primary} />
                <Text style={[styles.locationText, { color: theme.textSecondary }]}>{issue.address}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.upvoteBtn, { borderColor: theme.primary }, hasUpvoted && { backgroundColor: theme.primary }, !(user && issue.createdBy === user.id && upvoters.length > 0) && { marginBottom: SPACING.xl }]}
              onPress={handleUpvote} disabled={upvoting} activeOpacity={0.8}>
              {upvoting ? (
                <ActivityIndicator size="small" color={hasUpvoted ? '#ffffff' : theme.primary} />
              ) : (
                <>
                  <Ionicons name={hasUpvoted ? "thumbs-up" : "thumbs-up-outline"} size={18} color={hasUpvoted ? '#ffffff' : theme.primary} />
                  <Text style={[styles.upvoteBtnText, { color: theme.primary }, hasUpvoted && { color: '#ffffff' }]}>
                    {issue.upvoteCount} {issue.upvoteCount === 1 ? 'Upvote' : 'Upvotes'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Upvoter avatars — visible to issue creator */}
            {user && issue.createdBy === user.id && upvoters.length > 0 && (
              <View style={styles.upvotersRow}>
                <View style={styles.upvoterAvatars}>
                  {upvoters.slice(0, 8).map((voter, i) => (
                    <TouchableOpacity
                      key={voter.userId}
                      style={[styles.upvoterAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: upvoters.length - i }]}
                      onPress={() => navigation.navigate('UserProfile', { userId: voter.userId })}
                      activeOpacity={0.8}
                    >
                      {voter.userPhotoURL ? (
                        <Image source={{ uri: voter.userPhotoURL }} style={[styles.upvoterImg, { borderColor: theme.background }]} />
                      ) : (
                        <View style={[styles.upvoterImgPlaceholder, { borderColor: theme.background, backgroundColor: theme.border }]}>
                          <Ionicons name="person" size={10} color={theme.textMuted} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                  {upvoters.length > 8 && (
                    <View style={[styles.upvoterAvatar, { marginLeft: -8, zIndex: 0 }]}>
                      <View style={[styles.upvoterImgPlaceholder, { borderColor: theme.background, backgroundColor: theme.primaryLight }]}>
                        <Text style={[styles.upvoterOverflowText, { color: theme.primary }]}>+{upvoters.length - 8}</Text>
                      </View>
                    </View>
                  )}
                </View>
                <Text style={[styles.upvotersLabel, { color: theme.textMuted }]}>
                  {upvoters.length === 1
                    ? `${upvoters[0].userName || 'Someone'} upvoted`
                    : upvoters.length <= 3
                      ? `${upvoters.map(v => v.userName || 'Someone').join(', ')} upvoted`
                      : `${upvoters.slice(0, 2).map(v => v.userName || 'Someone').join(', ')} and ${upvoters.length - 2} others upvoted`}
                </Text>
              </View>
            )}

            {user && issue.status !== 'resolved' && (
              <TouchableOpacity
                style={[styles.suggestResolveBtn, { borderColor: theme.success }]}
                onPress={() => setShowResolveModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.success} />
                <Text style={[styles.suggestResolveBtnText, { color: theme.success }]}>Suggest as Resolved</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>COMMUNITY DISCUSSION</Text>

            {comments.length === 0 ? (
              <Text style={[styles.noComments, { color: theme.textMuted }]}>No comments yet. Be the first!</Text>
            ) : (
              comments.map(comment => (
                <View key={comment.id} style={[styles.commentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TouchableOpacity style={styles.commentHeader} onPress={() => navigation.navigate('UserProfile', { userId: comment.userId })} activeOpacity={0.7}>
                    {comment.userPhotoURL ? (
                      <Image source={{ uri: comment.userPhotoURL }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatarPlaceholder, { backgroundColor: theme.border }]}>
                        <Ionicons name="person" size={12} color={theme.textMuted} />
                      </View>
                    )}
                    <Text style={[styles.commentAuthor, { color: theme.primary }]}>{comment.userName}</Text>
                    <Text style={[styles.commentDate, { color: theme.textMuted }]}>{new Date(comment.createdAt).toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.commentBody, { color: theme.textSecondary }]}>{comment.body}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {user ? (
          <View style={[styles.commentFooter, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
            <View style={styles.commentInputRow}>
              <TextInput
                style={[styles.commentInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="Add a comment..."
                placeholderTextColor={theme.textMuted}
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[styles.commentSendBtn, { backgroundColor: theme.primary }, (!newComment.trim() || commenting) && { opacity: 0.5 }]}
                onPress={handleComment}
                disabled={!newComment.trim() || commenting}
              >
                {commenting ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={16} color="#ffffff" />}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.guestCommentCta, { backgroundColor: theme.card, borderTopColor: theme.border }]}
            onPress={() => toastRef.current?.show('Sign in to add a comment')}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.guestCommentCtaText, { color: theme.textMuted }]}>Sign in to join the discussion</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
        {/* Fullscreen Photo Viewer */}
        <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
          <StatusBar barStyle="light-content" />
          <View style={styles.photoViewerOverlay}>
            {/* Close button */}
            <TouchableOpacity style={styles.photoViewerClose} onPress={() => setFullscreenPhoto(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={28} color="#ffffff" />
            </TouchableOpacity>

            {/* Full image */}
            <ScrollView
              style={styles.photoViewerScroll}
              contentContainerStyle={styles.photoViewerScrollContent}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bouncesZoom
            >
              {fullscreenPhoto && (
                <Image
                  source={{ uri: fullscreenPhoto }}
                  style={styles.photoViewerImage}
                  resizeMode="contain"
                />
              )}
            </ScrollView>

            {/* Bottom bar with save + counter */}
            <View style={styles.photoViewerBar}>
              {issue && issue.photos.length > 1 && (
                <Text style={styles.photoViewerCounter}>
                  {(issue.photos.findIndex(p => p.url === fullscreenPhoto) + 1)} / {issue.photos.length}
                </Text>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.photoViewerSaveBtn}
                onPress={() => fullscreenPhoto && handleSavePhoto(fullscreenPhoto)}
                disabled={savingPhoto}
              >
                {savingPhoto ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#ffffff" />
                    <Text style={styles.photoViewerSaveText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Resolution Suggestion Modal */}
        <Modal visible={showResolveModal} transparent animationType="fade" onRequestClose={() => setShowResolveModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Suggest as Resolved</Text>
              <Text style={[styles.modalDesc, { color: theme.textSecondary }]}>
                Do you believe this issue has been resolved? An admin will review your suggestion.
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="Why do you think it's resolved? (optional)"
                placeholderTextColor={theme.textMuted}
                value={resolveReason}
                onChangeText={setResolveReason}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={500}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                  onPress={() => { setShowResolveModal(false); setResolveReason(''); }}
                >
                  <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { backgroundColor: theme.success }]}
                  onPress={handleSubmitResolution}
                  disabled={submittingSuggestion}
                >
                  {submittingSuggestion ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <AuthPromptToast ref={toastRef} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scroll: { paddingBottom: 100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { ...TYPOGRAPHY.body, fontWeight: '700' },

  photoContainer: { marginBottom: SPACING.lg },
  photoScroll: { height: 240 },
  photo: { width: SCREEN_WIDTH, height: 240, resizeMode: 'cover' },
  pageIndicators: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.sm, gap: SPACING.xs },
  pageDot: { height: 8, borderRadius: 4 },
  activeDot: { width: 20 },
  inactiveDot: { width: 8 },

  body: { padding: SPACING.lg },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  category: { ...TYPOGRAPHY.microLabel, flex: 1 },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.round },
  statusText: { ...TYPOGRAPHY.microLabel, letterSpacing: 1 },

  title: { ...TYPOGRAPHY.cardTitle, fontSize: 24, marginBottom: SPACING.md },
  description: { ...TYPOGRAPHY.body, lineHeight: 24, marginBottom: SPACING.md },

  statusNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderLeftWidth: 4 },
  statusNoteText: { ...TYPOGRAPHY.body, fontSize: 13, flex: 1, lineHeight: 20 },

  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  reporterAvatar: { width: 28, height: 28, borderRadius: 14 },
  reporterAvatarPlaceholder: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reporterName: { ...TYPOGRAPHY.caption, fontWeight: '700', flex: 1 },
  reporterDate: { ...TYPOGRAPHY.caption, fontWeight: '600' },

  mapSection: { marginBottom: SPACING.xl },
  mapPreview: { width: '100%', height: 200, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden' },
  expandMapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.sm, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  expandMapText: { ...TYPOGRAPHY.caption, fontWeight: '700' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm, marginBottom: SPACING.xl },
  locationText: { ...TYPOGRAPHY.body, fontSize: 13, flex: 1 },

  upvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 2, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, justifyContent: 'center', marginBottom: SPACING.sm },
  upvoteBtnText: { ...TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  upvotersRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xl, paddingHorizontal: SPACING.xs },
  upvoterAvatars: { flexDirection: 'row', alignItems: 'center' },
  upvoterAvatar: {},
  upvoterImg: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  upvoterImgPlaceholder: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  upvoterOverflowText: { fontSize: 9, fontWeight: '800' },
  upvotersLabel: { ...TYPOGRAPHY.caption, fontSize: 12, flex: 1 },
  suggestResolveBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 2, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, justifyContent: 'center', marginBottom: SPACING.xl },
  suggestResolveBtnText: { ...TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },

  sectionLabel: { ...TYPOGRAPHY.sectionLabel, marginBottom: SPACING.md },

  commentFooter: { borderTopWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  commentInputRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-end' },
  commentInput: { flex: 1, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, ...TYPOGRAPHY.body, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },

  noComments: { ...TYPOGRAPHY.body, textAlign: 'center', paddingVertical: SPACING.xl },

  commentCard: { borderRadius: BORDER_RADIUS.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.subtle },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  commentAvatar: { width: 24, height: 24, borderRadius: 12 },
  commentAvatarPlaceholder: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { ...TYPOGRAPHY.caption, fontWeight: '800', flex: 1 },
  commentDate: { ...TYPOGRAPHY.microLabel, fontWeight: '600' },
  commentBody: { ...TYPOGRAPHY.body, lineHeight: 21 },

  guestCommentCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  guestCommentCtaText: {
    ...TYPOGRAPHY.body,
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Fullscreen photo viewer
  photoViewerOverlay: { flex: 1, backgroundColor: '#000000' },
  photoViewerClose: { position: 'absolute', top: 54, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  photoViewerScroll: { flex: 1 },
  photoViewerScrollContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoViewerImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },
  photoViewerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  photoViewerCounter: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  photoViewerSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  photoViewerSaveText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  // Resolution suggestion modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  modalContent: { width: '100%', borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, ...SHADOWS.medium },
  modalTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 18, marginBottom: SPACING.sm },
  modalDesc: { ...TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginBottom: SPACING.lg },
  modalInput: { borderRadius: BORDER_RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, ...TYPOGRAPHY.body, fontSize: 14, minHeight: 80, marginBottom: SPACING.lg },
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  modalCancelText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  modalSubmitBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg },
  modalSubmitText: { ...TYPOGRAPHY.caption, fontWeight: '800', color: '#ffffff' },
});
