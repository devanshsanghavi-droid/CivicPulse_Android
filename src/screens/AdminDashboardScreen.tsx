// src/screens/AdminDashboardScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, SafeAreaView, Image, TextInput,
  Modal, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { firestoreService } from '../services/firestoreService';
import { useApp } from '../context/AppContext';
import { Issue, Comment, UserRecord, LoginRecord, ResolutionSuggestion, IssueStatus } from '../types';
import { CATEGORIES } from '../constants';
import { TYPOGRAPHY, SHADOWS, BORDER_RADIUS, SPACING } from '../styles/designSystem';

type AdminTab = 'issues' | 'users' | 'activity' | 'suggestions';
type IssueFilter = 'all' | 'open' | 'acknowledged' | 'resolved';

const STATUS_LIGHT: Record<string, { bg: string; text: string }> = {
  open: { bg: '#fee2e2', text: '#dc2626' },
  acknowledged: { bg: '#fef3c7', text: '#d97706' },
  resolved: { bg: '#dcfce7', text: '#16a34a' },
};
const STATUS_DARK: Record<string, { bg: string; text: string }> = {
  open: { bg: '#7f1d1d', text: '#fca5a5' },
  acknowledged: { bg: '#78350f', text: '#fcd34d' },
  resolved: { bg: '#14532d', text: '#86efac' },
};

export default function AdminDashboardScreen() {
  const { user, isAdmin, isDark, theme } = useApp();
  const isSuperAdmin = user?.role === 'super_admin';
  const [tab, setTab] = useState<AdminTab>('issues');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<UserRecord[]>([]);
  const [deletedIssues, setDeletedIssues] = useState<Issue[]>([]);
  const [deletedComments, setDeletedComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [issueSearch, setIssueSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [userIssues, setUserIssues] = useState<Issue[]>([]);
  const [userComments, setUserComments] = useState<Comment[]>([]);
  const [userModalLoading, setUserModalLoading] = useState(false);
  const [banDuration, setBanDuration] = useState('24');
  const [banUnit, setBanUnit] = useState<'hours' | 'days'>('hours');
  const [banPermanent, setBanPermanent] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [suggestions, setSuggestions] = useState<ResolutionSuggestion[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ banned: true, deleted: false, registered: false, logins: false });
  const [activitySearch, setActivitySearch] = useState('');

  const STATUS_COLORS = isDark ? STATUS_DARK : STATUS_LIGHT;

  const dedup = (arr: UserRecord[]) => {
    // Dedup by ID first, then by email (same person can have multiple Firestore docs)
    const byId = Array.from(new Map(arr.map(u => [u.id, u])).values());
    return Array.from(new Map(byId.map(u => [u.email.toLowerCase(), u])).values());
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'issues') { setIssues(await firestoreService.getIssues('newest')); }
      else if (tab === 'users') { setUsers(dedup(await firestoreService.getAllUsers())); }
      else if (tab === 'suggestions') { setSuggestions(await firestoreService.getResolutionSuggestions('pending')); }
      else {
        const [banned, delI, delC, logins, allU] = await Promise.all([
          firestoreService.getBannedUsers(), firestoreService.getDeletedIssues(),
          firestoreService.getDeletedComments(), firestoreService.getLoginHistory(100),
          firestoreService.getAllUsers(),
        ]);
        setBannedUsers(banned); setDeletedIssues(delI); setDeletedComments(delC); setLoginHistory(logins); setUsers(dedup(allU));
      }
    } catch (err) { console.error('Admin load error:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [tab]);

  const totalReports = issues.length;
  const openCount = issues.filter(i => i.status === 'open').length;
  const ackCount = issues.filter(i => i.status === 'acknowledged').length;
  const resolvedCount = issues.filter(i => i.status === 'resolved').length;
  const totalVotes = issues.reduce((s, i) => s + i.upvoteCount, 0);
  const filteredIssues = issues
    .filter(i => issueFilter === 'all' || i.status === issueFilter)
    .filter(i => !issueSearch || i.title.toLowerCase().includes(issueSearch.toLowerCase()) || i.description.toLowerCase().includes(issueSearch.toLowerCase()));
  const filteredUsers = userSearch ? users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())) : users;

  const handleStatusChange = (issue: Issue, newStatus: IssueStatus) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(`Mark as ${newStatus}`, 'Optional public status note:', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async (note?: string) => {
            try { await firestoreService.updateIssueStatus(issue.id, newStatus, note || ''); setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: newStatus, statusNote: note || '' } : i)); }
            catch { Alert.alert('Error', 'Failed to update status.'); }
          }
        }
      ], 'plain-text', '');
    } else {
      Alert.alert(`Mark as ${newStatus}?`, `Change status of "${issue.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: async () => { try { await firestoreService.updateIssueStatus(issue.id, newStatus); setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: newStatus } : i)); } catch { Alert.alert('Error', 'Failed.'); } } }
      ]);
    }
  };

  const handleDeleteIssue = (issue: Issue) => {
    Alert.alert('Delete Issue', `Remove "${issue.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await firestoreService.deleteIssue(issue.id, user?.name || 'Admin'); setIssues(prev => prev.filter(i => i.id !== issue.id)); } catch { Alert.alert('Error', 'Failed.'); } } }
    ]);
  };

  const openUserModal = async (u: UserRecord) => {
    setSelectedUser(u); setUserModalLoading(true); setBanDuration('24'); setBanUnit('hours'); setBanPermanent(false); setBanReason('');
    try { const [i, c] = await Promise.all([firestoreService.getIssuesByUser(u.id), firestoreService.getCommentsByUser(u.id)]); setUserIssues(i); setUserComments(c); }
    catch { setUserIssues([]); setUserComments([]); }
    finally { setUserModalLoading(false); }
  };

  const handleBanUser = async () => {
    if (!selectedUser) return;
    try {
      if (banPermanent) { await firestoreService.banUser(selectedUser.id, 'permanent', banReason); }
      else { await firestoreService.banUser(selectedUser.id, 'temporary', banReason, banUnit === 'days' ? parseInt(banDuration) * 24 : parseInt(banDuration)); }
      Alert.alert('User Banned', `${selectedUser.name} has been banned.`);
      setSelectedUser({ ...selectedUser, banType: banPermanent ? 'permanent' : 'temporary' }); loadData();
    } catch { Alert.alert('Error', 'Failed to ban user.'); }
  };

  const handleUnbanUser = async () => {
    if (!selectedUser) return;
    try { await firestoreService.unbanUser(selectedUser.id); Alert.alert('Unbanned', `${selectedUser.name} unbanned.`); setSelectedUser({ ...selectedUser, banType: 'none' }); loadData(); }
    catch { Alert.alert('Error', 'Failed.'); }
  };

  const handlePromote = async () => {
    if (!selectedUser) return;
    Alert.alert('Promote to Admin', `Promote ${selectedUser.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Promote', onPress: async () => { try { await firestoreService.setUserRole(selectedUser.id, 'admin'); setSelectedUser({ ...selectedUser, role: 'admin' }); loadData(); } catch { Alert.alert('Error', 'Failed.'); } } }]);
  };

  const handleDemote = async () => {
    if (!selectedUser) return;
    Alert.alert('Demote to Resident', `Demote ${selectedUser.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Demote', style: 'destructive', onPress: async () => { try { await firestoreService.setUserRole(selectedUser.id, 'resident'); setSelectedUser({ ...selectedUser, role: 'resident' }); loadData(); } catch { Alert.alert('Error', 'Failed.'); } } }]);
  };

  const handleDeleteComment = (c: Comment) => {
    Alert.alert('Delete Comment', 'Remove this comment?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await firestoreService.deleteComment(c.id, user?.name || 'Admin'); setUserComments(prev => prev.filter(x => x.id !== c.id)); } catch { Alert.alert('Error', 'Failed.'); } } }]);
  };

  const handleRestoreIssue = async (issue: Issue) => { try { await firestoreService.restoreIssue(issue.id); setDeletedIssues(prev => prev.filter(i => i.id !== issue.id)); } catch { Alert.alert('Error', 'Failed.'); } };
  const handleRestoreComment = async (comment: Comment) => { try { await firestoreService.restoreComment(comment.id); setDeletedComments(prev => prev.filter(c => c.id !== comment.id)); } catch { Alert.alert('Error', 'Failed.'); } };
  const toggleSection = (key: string) => { setExpandedSections(prev => ({ ...prev, [key]: !prev[key] })); };
  const userLoginCount = (userId: string) => loginHistory.filter(l => l.userId === userId).length;

  if (!isAdmin) return (
    <View style={[styles.centered, { backgroundColor: theme.background }]}>
      <Ionicons name="lock-closed" size={48} color={theme.border} />
      <Text style={[styles.noAccessText, { color: theme.textMuted }]}>ADMIN ACCESS REQUIRED</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>Admin Panel</Text>
        <Text style={[styles.subheading, { color: theme.primary }]}>CIVICPULSE CONTROL CENTER</Text>
      </View>

      <View style={styles.statsRow}>
        {[{ n: totalReports, l: 'Reports' }, { n: users.length, l: 'Users' }, { n: loginHistory.length, l: 'Sessions' }].map(s => (
          <View key={s.l} style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statNumber, { color: theme.primary }]}>{s.n}</Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.l}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tabs}>
        {(['issues', 'users', 'activity', 'suggestions'] as AdminTab[]).map(t => {
          const icons: Record<AdminTab, keyof typeof Ionicons.glyphMap> = { issues: 'list', users: 'people', activity: 'pulse', suggestions: 'checkmark-circle' };
          return (
            <TouchableOpacity key={t} style={[styles.tab, { backgroundColor: theme.card, borderColor: theme.border }, tab === t && { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={() => setTab(t)}>
              <Ionicons name={icons[t]} size={16} color={tab === t ? theme.primary : theme.textMuted} />
              <Text style={[styles.tabText, { color: theme.textMuted }, tab === t && { color: theme.primary }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {tab === 'issues' && (
            <>
              <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput style={[styles.searchInput, { color: theme.textPrimary }]} placeholder="Search issues by title or description..." placeholderTextColor={theme.textMuted} value={issueSearch} onChangeText={setIssueSearch} maxLength={100} />
              </View>
              <View style={styles.filterRow}>
                {[
                  { key: 'all' as IssueFilter, label: 'Total', count: totalReports, color: theme.primary },
                  { key: 'open' as IssueFilter, label: 'Open', count: openCount, color: theme.error },
                  { key: 'acknowledged' as IssueFilter, label: 'Ack', count: ackCount, color: theme.warning },
                  { key: 'resolved' as IssueFilter, label: 'Done', count: resolvedCount, color: theme.success },
                ].map(f => (
                  <TouchableOpacity key={f.key} style={[styles.filterCard, { backgroundColor: theme.card, borderColor: issueFilter === f.key ? f.color : theme.border }]} onPress={() => setIssueFilter(f.key)}>
                    <Text style={[styles.filterCount, { color: f.color }]}>{f.count}</Text>
                    <Text style={[styles.filterLabel, { color: theme.textMuted }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.filterCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.filterCount, { color: theme.primary }]}>{totalVotes}</Text>
                  <Text style={[styles.filterLabel, { color: theme.textMuted }]}>Votes</Text>
                </View>
              </View>

              {filteredIssues.map(issue => {
                const cat = CATEGORIES.find(c => c.id === issue.categoryId);
                const sc = STATUS_COLORS[issue.status] || STATUS_COLORS.open;
                return (
                  <View key={issue.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.issueCardRow}>
                      {issue.photos.length > 0 && <Image source={{ uri: issue.photos[0].url }} style={styles.issueThumb} />}
                      <View style={{ flex: 1 }}>
                        <View style={styles.issueTitleRow}>
                          <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{issue.title}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: sc.text }]}>{issue.status.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={[styles.issueDesc, { color: theme.textMuted }]} numberOfLines={2}>{issue.description}</Text>
                        <View style={styles.issueMetaRow}>
                          {issue.creatorPhotoURL ? <Image source={{ uri: issue.creatorPhotoURL }} style={styles.tinyAvatar} /> : <View style={[styles.tinyAvatarPlaceholder, { backgroundColor: theme.border }]}><Ionicons name="person" size={8} color={theme.textMuted} /></View>}
                          <Text style={[styles.issueMeta, { color: theme.textMuted }]}>{issue.creatorName}</Text>
                          <Text style={[styles.issueMeta, { color: theme.textMuted }]}>· {cat?.name || ''}</Text>
                          <Text style={[styles.issueMeta, { color: theme.textMuted }]}>· ▲ {issue.upvoteCount}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
                      {issue.status !== 'open' && (
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.primary }]} onPress={() => handleStatusChange(issue, 'open')}>
                          <Text style={[styles.actionBtnText, { color: theme.primary }]}>Reopen</Text>
                        </TouchableOpacity>
                      )}
                      {issue.status !== 'acknowledged' && (
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.warning }]} onPress={() => handleStatusChange(issue, 'acknowledged')}>
                          <Text style={[styles.actionBtnText, { color: theme.warning }]}>Ack</Text>
                        </TouchableOpacity>
                      )}
                      {issue.status !== 'resolved' && (
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.success }]} onPress={() => handleStatusChange(issue, 'resolved')}>
                          <Text style={[styles.actionBtnText, { color: theme.success }]}>Resolve</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.error }]} onPress={() => handleDeleteIssue(issue)}>
                        <Ionicons name="trash-outline" size={12} color={theme.error} />
                        <Text style={[styles.actionBtnText, { color: theme.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {tab === 'users' && (
            <>
              <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput style={[styles.searchInput, { color: theme.textPrimary }]} placeholder="Search by name or email..." placeholderTextColor={theme.textMuted} value={userSearch} onChangeText={setUserSearch} maxLength={100} />
              </View>
              {filteredUsers.map(u => (
                <TouchableOpacity key={u.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => openUserModal(u)} activeOpacity={0.7}>
                  <View style={styles.userRow}>
                    {u.photoURL ? <Image source={{ uri: u.photoURL }} style={styles.userAvatar} /> : <View style={[styles.userAvatarPlaceholder, { backgroundColor: theme.border }]}><Ionicons name="person" size={16} color={theme.textMuted} /></View>}
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: theme.textPrimary }]}>{u.name}</Text>
                      <Text style={[styles.userEmail, { color: theme.textMuted }]}>{u.email}</Text>
                      <View style={styles.userTags}>
                        <View style={[styles.roleTag, { backgroundColor: theme.primaryLight }]}><Text style={[styles.roleTagText, { color: theme.primary }]}>{u.role.toUpperCase()}</Text></View>
                        {u.banType !== 'none' && <View style={styles.bannedTag}><Text style={styles.bannedTagText}>BANNED</Text></View>}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {tab === 'activity' && (
            <>
              <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput style={[styles.searchInput, { color: theme.textPrimary }]} placeholder="Search activity..." placeholderTextColor={theme.textMuted} value={activitySearch} onChangeText={setActivitySearch} maxLength={100} />
              </View>

              <TouchableOpacity style={[styles.sectionHeader, { borderBottomColor: theme.border }]} onPress={() => toggleSection('banned')}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Banned Users ({bannedUsers.length})</Text>
                <Ionicons name={expandedSections.banned ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
              </TouchableOpacity>
              {expandedSections.banned && bannedUsers.map(u => (
                <View key={u.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.activityName, { color: theme.textPrimary }]}>{u.name}</Text>
                  <Text style={[styles.activityMeta, { color: theme.textMuted }]}>{u.banType === 'permanent' ? '🔴 Permanent' : `⏳ Temp — expires ${u.bannedUntil ? new Date(u.bannedUntil).toLocaleDateString() : 'N/A'}`}</Text>
                  {u.banReason ? <Text style={[styles.activityMeta, { color: theme.textMuted }]}>Reason: {u.banReason}</Text> : null}
                </View>
              ))}

              <TouchableOpacity style={[styles.sectionHeader, { borderBottomColor: theme.border }]} onPress={() => toggleSection('deleted')}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Deleted Items ({deletedIssues.length + deletedComments.length})</Text>
                <Ionicons name={expandedSections.deleted ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
              </TouchableOpacity>
              {expandedSections.deleted && (
                <>
                  {deletedIssues.map(i => (
                    <View key={i.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={styles.activityCardRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.activityName, { color: theme.textPrimary }]}>Issue: {i.title}</Text>
                          <Text style={[styles.activityMeta, { color: theme.textMuted }]}>Deleted by {i.deletedByName}</Text>
                        </View>
                        <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={() => handleRestoreIssue(i)}>
                          <Text style={[styles.restoreBtnText, { color: theme.primary }]}>Restore</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {deletedComments.map(c => (
                    <View key={c.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={styles.activityCardRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.activityName, { color: theme.textPrimary }]}>Comment by {c.userName}</Text>
                          <Text style={[styles.activityMeta, { color: theme.textMuted }]} numberOfLines={1}>{c.body}</Text>
                        </View>
                        <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={() => handleRestoreComment(c)}>
                          <Text style={[styles.restoreBtnText, { color: theme.primary }]}>Restore</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <TouchableOpacity style={[styles.sectionHeader, { borderBottomColor: theme.border }]} onPress={() => toggleSection('registered')}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Registered Users ({users.length})</Text>
                <Ionicons name={expandedSections.registered ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
              </TouchableOpacity>
              {expandedSections.registered && users.filter(u => !activitySearch || u.name.toLowerCase().includes(activitySearch.toLowerCase())).map(u => (
                <View key={u.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.activityName, { color: theme.textPrimary }]}>{u.name}</Text>
                  <Text style={[styles.activityMeta, { color: theme.textMuted }]}>{u.email} · {userLoginCount(u.id)} logins</Text>
                </View>
              ))}

              <TouchableOpacity style={[styles.sectionHeader, { borderBottomColor: theme.border }]} onPress={() => toggleSection('logins')}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Logins ({loginHistory.length})</Text>
                <Ionicons name={expandedSections.logins ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
              </TouchableOpacity>
              {expandedSections.logins && loginHistory.filter(l => !activitySearch || l.name.toLowerCase().includes(activitySearch.toLowerCase())).slice(0, 50).map(l => (
                <View key={l.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.activityName, { color: theme.textPrimary }]}>{l.name}</Text>
                  <Text style={[styles.activityMeta, { color: theme.textMuted }]}>{l.email} · {new Date(l.loginAt).toLocaleString()}</Text>
                </View>
              ))}
            </>
          )}

          {tab === 'suggestions' && (
            <>
              {suggestions.length === 0 ? (
                <View style={styles.centered}><Text style={[styles.issueMeta, { color: theme.textMuted, textAlign: 'center', marginTop: SPACING.xxl }]}>No pending suggestions</Text></View>
              ) : (
                suggestions.map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{s.issueTitle}</Text>
                    <View style={styles.issueMetaRow}>
                      <Text style={[styles.issueMeta, { color: theme.textMuted }]}>
                        Suggested by {s.suggestedByName} · {new Date(s.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: theme.success }]}
                        onPress={() => {
                          Alert.alert('Approve Suggestion', `Mark "${s.issueTitle}" as resolved?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Approve', onPress: async () => {
                                try {
                                  await firestoreService.reviewResolutionSuggestion(s.id, 'approved', user?.id || '');
                                  await firestoreService.updateIssueStatus(s.issueId, 'resolved', `Resolved based on community suggestion by ${s.suggestedByName}`);
                                  setSuggestions(prev => prev.filter(x => x.id !== s.id));
                                } catch { Alert.alert('Error', 'Failed to approve suggestion.'); }
                              }
                            }
                          ]);
                        }}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.success }]}>Approve & Resolve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: theme.error }]}
                        onPress={async () => {
                          try {
                            await firestoreService.reviewResolutionSuggestion(s.id, 'rejected', user?.id || '');
                            setSuggestions(prev => prev.filter(x => x.id !== s.id));
                          } catch { Alert.alert('Error', 'Failed to reject suggestion.'); }
                        }}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.error }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* User Detail Modal */}
      <Modal visible={!!selectedUser} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>User Details</Text>
            <TouchableOpacity onPress={() => setSelectedUser(null)}><Ionicons name="close" size={24} color={theme.textPrimary} /></TouchableOpacity>
          </View>
          {selectedUser && (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalUserHeader}>
                {selectedUser.photoURL ? <Image source={{ uri: selectedUser.photoURL }} style={styles.modalAvatar} /> : <View style={[styles.modalAvatar, styles.userAvatarPlaceholder, { backgroundColor: theme.border }]}><Ionicons name="person" size={32} color={theme.textMuted} /></View>}
                <Text style={[styles.modalUserName, { color: theme.textPrimary }]}>{selectedUser.name}</Text>
                <Text style={[styles.modalUserEmail, { color: theme.textMuted }]}>{selectedUser.email}</Text>
                <View style={styles.userTags}>
                  <View style={[styles.roleTag, { backgroundColor: theme.primaryLight }]}><Text style={[styles.roleTagText, { color: theme.primary }]}>{selectedUser.role.toUpperCase()}</Text></View>
                  {selectedUser.banType !== 'none' && <View style={styles.bannedTag}><Text style={styles.bannedTagText}>{selectedUser.banType.toUpperCase()} BAN</Text></View>}
                </View>
              </View>

              <View style={styles.dateRow}>
                <Text style={[styles.dateMeta, { color: theme.textMuted }]}>First seen: {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}</Text>
                <Text style={[styles.dateMeta, { color: theme.textMuted }]}>Last: {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString() : 'N/A'}</Text>
                <Text style={[styles.dateMeta, { color: theme.textMuted }]}>Logins: {userLoginCount(selectedUser.id)}</Text>
              </View>

              {userModalLoading ? <ActivityIndicator size="large" color={theme.primary} style={{ marginVertical: 32 }} /> : (
                <>
                  <Text style={[styles.modalSectionLabel, { color: theme.textMuted }]}>ISSUES ({userIssues.length})</Text>
                  {userIssues.length === 0 ? <Text style={[styles.emptyText, { color: theme.textMuted }]}>No issues</Text> :
                    userIssues.map(i => (
                      <View key={i.id} style={[styles.miniCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.miniCardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{i.title}</Text>
                        <Text style={[styles.miniCardMeta, { color: theme.textMuted }]}>{i.status} · {new Date(i.createdAt).toLocaleDateString()} · ▲ {i.upvoteCount}</Text>
                      </View>
                    ))
                  }

                  <Text style={[styles.modalSectionLabel, { color: theme.textMuted }]}>COMMENTS ({userComments.length})</Text>
                  {userComments.length === 0 ? <Text style={[styles.emptyText, { color: theme.textMuted }]}>No comments</Text> :
                    userComments.map(c => (
                      <View key={c.id} style={[styles.miniCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.miniCardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{c.body}</Text>
                        <View style={styles.miniCardRow}>
                          <Text style={[styles.miniCardMeta, { color: theme.textMuted }]}>{new Date(c.createdAt).toLocaleDateString()}</Text>
                          <TouchableOpacity onPress={() => handleDeleteComment(c)}><Text style={[styles.deleteLink, { color: theme.error }]}>Delete</Text></TouchableOpacity>
                        </View>
                      </View>
                    ))
                  }

                  {selectedUser.role !== 'super_admin' && (
                    <>
                      <Text style={[styles.modalSectionLabel, { color: theme.textMuted }]}>BAN CONTROLS</Text>
                      {selectedUser.banType !== 'none' ? (
                        <TouchableOpacity style={[styles.unbanFullBtn, { backgroundColor: theme.success }]} onPress={handleUnbanUser}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.unbanFullBtnText}>Unban User</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.banControls}>
                          <View style={styles.banRow}>
                            <TextInput style={[styles.banInput, { flex: 1, backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]} placeholder="Duration" placeholderTextColor={theme.textMuted} value={banDuration} onChangeText={setBanDuration} keyboardType="numeric" editable={!banPermanent} maxLength={5} />
                            {(['hours', 'days'] as const).map(u => (
                              <TouchableOpacity key={u} style={[styles.unitBtn, { backgroundColor: theme.card, borderColor: theme.border }, banUnit === u && { backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }]} onPress={() => setBanUnit(u)} disabled={banPermanent}>
                                <Text style={[styles.unitBtnText, { color: theme.textMuted }, banUnit === u && { color: theme.primary }]}>{u.charAt(0).toUpperCase() + u.slice(1)}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TouchableOpacity style={styles.permToggle} onPress={() => setBanPermanent(!banPermanent)}>
                            <Ionicons name={banPermanent ? 'checkbox' : 'square-outline'} size={20} color={theme.error} />
                            <Text style={[styles.permToggleText, { color: theme.error }]}>Permanent ban</Text>
                          </TouchableOpacity>
                          <TextInput style={[styles.banInput, { minHeight: 60, backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]} placeholder="Ban reason (optional)..." placeholderTextColor={theme.textMuted} value={banReason} onChangeText={setBanReason} multiline maxLength={500} />
                          <TouchableOpacity style={[styles.banFullBtn, { backgroundColor: theme.error }]} onPress={handleBanUser}>
                            <Ionicons name="ban" size={18} color="#fff" /><Text style={styles.banFullBtnText}>Apply Ban</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {isSuperAdmin && (
                        <View style={styles.promoteRow}>
                          {selectedUser.role === 'resident' || selectedUser.role === 'guest' ? (
                            <TouchableOpacity style={[styles.promoteBtn, { borderColor: theme.primary }]} onPress={handlePromote}>
                              <Ionicons name="arrow-up-circle" size={16} color={theme.primary} /><Text style={[styles.promoteBtnText, { color: theme.primary }]}>Promote to Admin</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[styles.demoteBtn, { borderColor: theme.warning }]} onPress={handleDemote}>
                              <Ionicons name="arrow-down-circle" size={16} color={theme.warning} /><Text style={[styles.demoteBtnText, { color: theme.warning }]}>Demote to Resident</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  noAccessText: { ...TYPOGRAPHY.sectionLabel },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  heading: { ...TYPOGRAPHY.pageTitle, fontSize: 26 },
  subheading: { ...TYPOGRAPHY.microLabel, marginTop: SPACING.xs },
  statsRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  statCard: { flex: 1, borderRadius: BORDER_RADIUS.md, borderWidth: 1, padding: SPACING.md, alignItems: 'center', ...SHADOWS.subtle },
  statNumber: { ...TYPOGRAPHY.cardTitle, fontSize: 22 },
  statLabel: { ...TYPOGRAPHY.microLabel, marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  tabText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
  filterRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm },
  filterCard: { flex: 1, borderRadius: BORDER_RADIUS.md, borderWidth: 2, padding: SPACING.sm, alignItems: 'center' },
  filterCount: { fontSize: 18, fontWeight: '900' },
  filterLabel: { ...TYPOGRAPHY.microLabel, marginTop: 2 },
  card: { borderRadius: BORDER_RADIUS.lg, borderWidth: 1, padding: SPACING.md, ...SHADOWS.subtle },
  cardTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 15, flex: 1 },
  issueCardRow: { flexDirection: 'row', gap: SPACING.sm },
  issueThumb: { width: 56, height: 56, borderRadius: BORDER_RADIUS.sm },
  issueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.round },
  statusBadgeText: { ...TYPOGRAPHY.microLabel, letterSpacing: 0.5 },
  issueDesc: { ...TYPOGRAPHY.caption, marginBottom: SPACING.xs, lineHeight: 16 },
  issueMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' },
  tinyAvatar: { width: 14, height: 14, borderRadius: 7 },
  tinyAvatarPlaceholder: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  issueMeta: { ...TYPOGRAPHY.microLabel, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, borderTopWidth: 1, paddingTop: SPACING.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.sm, borderWidth: 1 },
  actionBtnText: { ...TYPOGRAPHY.microLabel, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  searchInput: { flex: 1, paddingVertical: SPACING.md, ...TYPOGRAPHY.body },
  userRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  userAvatar: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1 },
  userName: { ...TYPOGRAPHY.cardTitle, fontSize: 14, marginBottom: 2 },
  userEmail: { ...TYPOGRAPHY.caption, marginBottom: SPACING.xs },
  userTags: { flexDirection: 'row', gap: SPACING.xs },
  roleTag: { borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.xs, paddingVertical: 2 },
  roleTagText: { ...TYPOGRAPHY.microLabel, letterSpacing: 0.5 },
  bannedTag: { backgroundColor: '#fee2e2', borderRadius: BORDER_RADIUS.round, paddingHorizontal: SPACING.xs, paddingVertical: 2 },
  bannedTagText: { ...TYPOGRAPHY.microLabel, color: '#dc2626', letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.md, borderBottomWidth: 1, marginTop: SPACING.sm },
  sectionTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 14 },
  activityCard: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, padding: SPACING.md },
  activityCardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  activityName: { ...TYPOGRAPHY.caption, fontWeight: '800', marginBottom: 2 },
  activityMeta: { ...TYPOGRAPHY.microLabel, fontWeight: '600', lineHeight: 16 },
  restoreBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.sm, borderWidth: 1 },
  restoreBtnText: { ...TYPOGRAPHY.microLabel, fontWeight: '800' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  modalTitle: { ...TYPOGRAPHY.cardTitle, fontSize: 18 },
  modalUserHeader: { alignItems: 'center', paddingVertical: SPACING.xl },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, marginBottom: SPACING.sm },
  modalUserName: { ...TYPOGRAPHY.cardTitle, fontSize: 20, marginBottom: 2 },
  modalUserEmail: { ...TYPOGRAPHY.caption, marginBottom: SPACING.sm },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  dateMeta: { ...TYPOGRAPHY.microLabel, fontWeight: '600' },
  modalSectionLabel: { ...TYPOGRAPHY.sectionLabel, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  emptyText: { ...TYPOGRAPHY.body, textAlign: 'center', paddingVertical: SPACING.md },
  miniCard: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.xs },
  miniCardTitle: { ...TYPOGRAPHY.caption, fontWeight: '800', marginBottom: 2 },
  miniCardMeta: { ...TYPOGRAPHY.microLabel, fontWeight: '600' },
  miniCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deleteLink: { ...TYPOGRAPHY.microLabel, fontWeight: '800' },
  banControls: { gap: SPACING.sm },
  banRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  banInput: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, ...TYPOGRAPHY.body },
  unitBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  unitBtnText: { ...TYPOGRAPHY.microLabel, fontWeight: '800' },
  permToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  permToggleText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  banFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md },
  banFullBtnText: { ...TYPOGRAPHY.caption, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  unbanFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md },
  unbanFullBtnText: { ...TYPOGRAPHY.caption, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  promoteRow: { marginTop: SPACING.lg },
  promoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderWidth: 2, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md },
  promoteBtnText: { ...TYPOGRAPHY.caption, fontWeight: '800' },
  demoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderWidth: 2, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md },
  demoteBtnText: { ...TYPOGRAPHY.caption, fontWeight: '800' },
});
