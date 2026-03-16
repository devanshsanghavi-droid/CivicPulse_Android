# CLAUDE.md - CivicPulse Mobile App

## Build & Run Commands

```bash
npm install              # Install dependencies
npm start                # Start Expo dev server
npm run ios              # Run on iOS Simulator
npm run android          # Run on Android Emulator
npm run web              # Run web version
npm run build:dev        # Dev build (both platforms)
npm run build:dev:ios    # Dev build (iOS only)
npm run build:dev:android # Dev build (Android only)
npm run build:preview    # Preview build (both platforms)
npm run build:prod       # Production build (both platforms)
npm run submit:prod      # Submit to app stores
```

Uses EAS (Expo Application Services) for native builds with three profiles: development, preview, production.

## Architecture

- **React Native** (0.81.5) + **Expo** (54.0.33) + **TypeScript** (strict mode)
- **Firebase**: Auth (Google Sign-In), Firestore (data), Storage (photos)
- **React Navigation** (7.x): Stack + Bottom Tab navigation
- **State**: AppContext provider accessed via `useApp()` hook
- **Local storage**: AsyncStorage for caching, preferences, upvote tracking

### Navigation Structure

```
RootStack (unified flat stack — guests can browse without auth)
├── Landing
├── Login
├── Main (Bottom Tabs)
│   ├── Feed         # Status filter tabs, resolved sort to bottom
│   ├── Map          # Pin clustering, Dynamic Island safe area
│   ├── Report       # Guests see "Log In" pill instead
│   ├── Profile
│   └── Admin        # Hidden for non-admins (4 tabs: issues, users, activity, suggestions)
├── IssueDetail      # "Suggest as Resolved" button for logged-in users
└── LocationExplanation (modal)
```

Guest browsing: Feed, Map, and IssueDetail are publicly accessible. Login is only required for interactions (upvote, comment, report). Guest users see `GuestBanner` and `AuthPromptToast` components prompting sign-in.

### Data Flow

Components → Firestore service → Firestore DB
AppContext polls notifications every 10 seconds
AsyncStorage caches data for offline access

## Project Structure

```
├── App.tsx                         # Root component
├── index.ts                        # Expo entry point
├── app.json                        # Expo config, permissions, bundle ID
├── eas.json                        # EAS build profiles
├── src/
│   ├── App.tsx                     # Provider setup (AppContext wraps navigation)
│   ├── navigation/AppNavigator.tsx # Stack + Tab nav, auth-gated routing
│   ├── context/AppContext.tsx      # Global state: user, auth, notifs, dark mode
│   ├── screens/                    # 9 screens (Feed, Map, Report, Profile, Admin, Landing, Login, IssueDetail, LocationExplanation)
│   ├── services/
│   │   ├── firebaseConfig.ts       # Firebase init with AsyncStorage persistence
│   │   ├── firebaseAuth.ts         # Google Sign-In, session management
│   │   ├── firestoreService.ts     # Firestore CRUD for issues, comments, upvotes, resolution suggestions
│   │   └── storage.ts             # AsyncStorage wrapper, trending score calc
│   ├── components/                 # SplineBackground, ThemeToggle, GuestBanner, AuthPromptToast
│   ├── constants/
│   │   ├── index.ts               # Categories (9), admin emails
│   │   └── theme.ts               # Light/dark theme color objects
│   ├── styles/designSystem.ts     # COLORS, TYPOGRAPHY, SPACING, SHADOWS, BORDER_RADIUS
│   └── types/index.ts             # TypeScript interfaces (User, Issue, Comment, ResolutionSuggestion, etc.)
```

## Key Patterns

- **Functional components** with hooks; no class components
- **Theme-aware styling**: Conditional colors from `lightTheme`/`darkTheme` via `useApp().darkMode`
- **StyleSheet API**: Native RN styling, no CSS-in-JS libraries
- **Design system tokens**: Import from `styles/designSystem.ts` for consistent spacing, typography, shadows
- **Safe area**: `react-native-safe-area-context` for notch/status bar handling
- **Error handling**: Try-catch in services, Alert dialogs for user-facing errors

## Key Data Types

- **User**: roles are `guest | resident | admin | super_admin`
- **Issue**: statuses are `open | acknowledged | resolved`; has photos, location, category
- **9 Categories**: Potholes, Streetlights, Trash, Sidewalks, Parks, Traffic Signals, Water, Safety, Other
- **ResolutionSuggestion**: community-submitted suggestions that an issue is resolved; admin reviews (pending/approved/rejected)
- **Trending score**: `upvotes * 2 + max(0, 7 - daysSinceCreation)`

## Firestore Collections

`issues`, `comments`, `notifications`, `upvotes`, `users`, `loginRecords`, `deletedIssues`, `deletedComments`, `bannedUsers`, `resolutionSuggestions`

## Git Workflow

**Commit regularly with clean messages.** After completing discrete units of work, commit to git with clear, descriptive messages to preserve work and maintain status. This prevents losing progress and provides context for future sessions.

Example patterns:
- `feat: Add new feature description`
- `fix: Fix specific bug description`
- `refactor: Refactor component or service`
- `docs: Update documentation`

## Notable Details

- Google Sign-In uses native `@react-native-google-signin/google-signin` (not web popup)
- Photos: captured via `expo-image-picker`, uploaded to Firebase Storage on submission (0.8 quality)
- Map: `react-native-maps` with `react-native-map-clustering` for pin clustering (amber clusters, 50px radius)
- Map uses `useSafeAreaInsets()` for Dynamic Island/notch-safe overlay positioning
- Login screen has a Spline 3D WebView background
- Login: confirm password has independent eye toggle; email verification via `sendEmailVerification`
- Test account: `developertest@gmail.com` / `tester` — bypasses email verification
- Notifications are polled from Firestore (not push notifications)
- Dark mode: preference persisted in AsyncStorage key `civicpulse_darkMode`; tab bar colors are theme-aware
- Feed: status filter tabs (All/Open/Acknowledged/Resolved); resolved issues sort to bottom by default
- Report form: Title and Category required, Description optional
- Admin dashboard: 4 tabs (issues with search, users with dedup, activity, suggestions)
- Firebase project ID: `civicpulsewebsite`
