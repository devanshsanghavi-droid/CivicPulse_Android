// src/screens/InsightsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  ActivityIndicator, TouchableOpacity, SafeAreaView
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { firestoreService } from '../services/firestoreService';
import { Issue, Comment } from '../types';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

type RouteType = RouteProp<RootStackParamList, 'Insights'>;

type UpvoterEntry = {
  userId: string;
  userName?: string;
  userPhotoURL?: string;
  createdAt?: string;
};

type ActivityType = 'created' | 'upvote' | 'comment' | 'status_change';

type ActivityEntry = {
  id: string;
  type: ActivityType;
  userName: string;
  userPhotoURL?: string;
  timestamp?: string;
  body?: string;
  status?: string;
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  created: '#2563eb',
  upvote: '#8b5cf6',
  comment: '#0891b2',
  status_change: '#16a34a',
};

const ACTIVITY_ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  created: 'flag',
  upvote: 'thumbs-up',
  comment: 'chatbubble',
  status_change: 'shield-checkmark',
};

export default function InsightsScreen() {
  const { theme } = useApp();
  const route = useRoute<RouteType>();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { issueId } = route.params;

  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [upvoters, setUpvoters] = useState<UpvoterEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [issueData, upvoterData, commentData] = await Promise.all([
          firestoreService.getIssue(issueId),
          firestoreService.getUpvoters(issueId),
          firestoreService.getComments(issueId),
        ]);
        if (cancelled) return;
        setIssue(issueData);
        setUpvoters(upvoterData);
        setComments(commentData);

        if (issueData) {
          const entries: ActivityEntry[] = [];

          entries.push({
            id: 'created',
            type: 'created',
            userName: issueData.creatorName,
            userPhotoURL: issueData.creatorPhotoURL,
            timestamp: issueData.createdAt,
          });

          upvoterData.forEach(v => {
            entries.push({
              id: `upvote_${v.userId}`,
              type: 'upvote',
              userName: v.userName || 'Community Member',
              userPhotoURL: v.userPhotoURL,
              timestamp: v.createdAt,
            });
          });

          commentData.forEach(c => {
            entries.push({
              id: `comment_${c.id}`,
              type: 'comment',
              userName: c.userName,
              userPhotoURL: c.userPhotoURL,
              timestamp: c.createdAt,
              body: c.body,
            });
          });

          if (issueData.status !== 'open' && issueData.updatedAt !== issueData.createdAt) {
            entries.push({
              id: 'status_change',
              type: 'status_change',
              userName: 'Admin',
              timestamp: issueData.updatedAt,
              status: issueData.status,
            });
          }

          const withTs = entries
            .filter(e => e.timestamp)
            .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());
          const withoutTs = entries.filter(e => !e.timestamp);
          if (!cancelled) setActivity([...withTs, ...withoutTs]);
        }
      } catch (err) {
        console.error('InsightsScreen load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [issueId]);

  const formatDate = (ts?: string) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const getActivityLabel = (entry: ActivityEntry) => {
    switch (entry.type) {
      case 'created': return 'reported this issue';
      case 'upvote': return 'upvoted';
      case 'comment': {
        const preview = (entry.body || '').slice(0, 80);
        return `commented: "${preview}${(entry.body?.length ?? 0) > 80 ? '…' : ''}"`;
      }
      case 'status_change': return `status changed to ${entry.status}`;
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!issue) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.textMuted }]}>Issue not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Issue banner */}
        <View style={[styles.issueBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.issueTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {issue.title}
          </Text>
          <Text style={[styles.issueDate, { color: theme.textMuted }]}>
            Reported {formatDate(issue.createdAt)}
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { icon: 'eye-outline' as const, value: issue.viewCount ?? 0, label: 'Views', color: '#0891b2' },
            { icon: 'thumbs-up-outline' as const, value: issue.upvoteCount, label: 'Upvotes', color: '#8b5cf6' },
            { icon: 'chatbubble-outline' as const, value: comments.length, label: 'Comments', color: theme.primary },
          ].map(stat => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name={stat.icon} size={22} color={stat.color} />
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Upvoters section */}
        {upvoters.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              WHO UPVOTED ({upvoters.length})
            </Text>
            <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {upvoters.map((voter, idx) => (
                <TouchableOpacity
                  key={voter.userId}
                  style={[
                    styles.voterRow,
                    idx < upvoters.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  ]}
                  onPress={() => navigation.navigate('UserProfile', { userId: voter.userId })}
                  activeOpacity={0.7}
                >
                  {voter.userPhotoURL ? (
                    <Image source={{ uri: voter.userPhotoURL }} style={styles.voterAvatar} />
                  ) : (
                    <View style={[styles.voterAvatarPlaceholder, { backgroundColor: theme.border }]}>
                      <Ionicons name="person" size={14} color={theme.textMuted} />
                    </View>
                  )}
                  <Text style={[styles.voterName, { color: theme.textPrimary }]}>
                    {voter.userName || 'Community Member'}
                  </Text>
                  <View style={styles.voterRight}>
                    {voter.createdAt ? (
                      <Text style={[styles.voterDate, { color: theme.textMuted }]}>
                        {formatDate(voter.createdAt)}
                      </Text>
                    ) : null}
                    <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Activity feed */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
          ACTIVITY ({activity.length})
        </Text>
        {activity.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No activity yet.</Text>
        ) : (
          <View>
            {activity.map((entry, idx) => {
              const color = ACTIVITY_COLORS[entry.type];
              const icon = ACTIVITY_ICONS[entry.type];
              const isLast = idx === activity.length - 1;
              return (
                <View key={entry.id} style={styles.timelineEntry}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: color }]}>
                      <Ionicons name={icon} size={11} color="#ffffff" />
                    </View>
                    {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />}
                  </View>
                  <View style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.timelineRow}>
                      {entry.userPhotoURL ? (
                        <Image source={{ uri: entry.userPhotoURL }} style={styles.timelineAvatar} />
                      ) : (
                        <View style={[styles.timelineAvatarPlaceholder, { backgroundColor: theme.border }]}>
                          <Ionicons
                            name={entry.type === 'status_change' ? 'shield-checkmark' : 'person'}
                            size={10}
                            color={entry.type === 'status_change' ? color : theme.textMuted}
                          />
                        </View>
                      )}
                      <View style={styles.timelineText}>
                        <Text style={[styles.timelineUser, { color: theme.textPrimary }]} numberOfLines={1}>
                          {entry.userName}
                        </Text>
                        <Text style={[styles.timelineAction, { color: theme.textSecondary }]} numberOfLines={3}>
                          {getActivityLabel(entry)}
                        </Text>
                      </View>
                      {entry.timestamp ? (
                        <View style={styles.timelineTs}>
                          <Text style={[styles.timelineTsDate, { color: theme.textMuted }]}>
                            {formatDate(entry.timestamp)}
                          </Text>
                          <Text style={[styles.timelineTsTime, { color: theme.textMuted }]}>
                            {formatTime(entry.timestamp)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { ...TYPOGRAPHY.body, fontWeight: '700' },
  scroll: { padding: SPACING.lg },
  bottomPad: { height: SPACING.xl },

  issueBanner: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.subtle,
  },
  issueTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 17, marginBottom: SPACING.xs },
  issueDate: { ...TYPOGRAPHY.caption },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  statCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
    ...SHADOWS.subtle,
  },
  statValue: { ...TYPOGRAPHY.cardTitle, fontSize: 24 },
  statLabel: { ...TYPOGRAPHY.microLabel },

  sectionLabel: { ...TYPOGRAPHY.sectionLabel, marginBottom: SPACING.sm },
  emptyText: { ...TYPOGRAPHY.body, textAlign: 'center', paddingVertical: SPACING.xl },

  listCard: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
    ...SHADOWS.subtle,
  },
  voterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  voterAvatar: { width: 32, height: 32, borderRadius: 16 },
  voterAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voterName: { ...TYPOGRAPHY.body, fontWeight: '700', flex: 1 },
  voterRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  voterDate: { ...TYPOGRAPHY.microLabel },

  timelineEntry: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineLine: { width: 2, flex: 1, marginTop: 4, marginBottom: -4 },
  timelineCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    ...SHADOWS.subtle,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  timelineAvatar: { width: 26, height: 26, borderRadius: 13, marginTop: 1 },
  timelineAvatarPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  timelineText: { flex: 1 },
  timelineUser: { ...TYPOGRAPHY.caption, fontWeight: '800' },
  timelineAction: { ...TYPOGRAPHY.caption, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  timelineTs: { alignItems: 'flex-end', flexShrink: 0 },
  timelineTsDate: { ...TYPOGRAPHY.microLabel },
  timelineTsTime: { ...TYPOGRAPHY.microLabel, marginTop: 1 },
});
