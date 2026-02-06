
## Guest Mode for Researcher Dashboard

This plan adds a "View as Guest" option on the researcher login page that allows anyone to explore the dashboard with realistic dummy data - no credentials required.

### Overview

| Aspect | Description |
|--------|-------------|
| Entry Point | New "View as Guest" button on login page |
| Authentication | No real auth - uses local state to flag guest mode |
| Data Source | Static dummy data instead of database queries |
| Permissions | Read-only viewer experience (no downloads, no admin features) |

### User Experience

1. **Login Page**: Add a prominent "View as Guest" button below the sign-in form
2. **Dashboard Header**: Show "Guest" badge instead of email, with "Exit Guest Mode" button
3. **Data Display**: All tabs show realistic dummy data matching the real data structure
4. **Restricted Actions**: Downloads, archiving, and admin features are hidden/disabled

### Architecture

```text
+------------------+     +-----------------------+
| ResearcherLogin  |     | ResearcherAuthContext |
|                  |     |                       |
| [View as Guest]--+---->| isGuestMode: boolean  |
|                  |     | enterGuestMode()      |
+------------------+     | exitGuestMode()       |
                         +-----------------------+
                                    |
                    +---------------+---------------+
                    |               |               |
              DataSummary   UnifiedTable    TimeAnalysis
                    |               |               |
              +-----+-----+   +-----+-----+   +-----+-----+
              | if guest: |   | if guest: |   | if guest: |
              | use dummy |   | use dummy |   | use dummy |
              +-----------+   +-----------+   +-----------+
```

### Dummy Data Samples

The guest mode will display:
- **42 responses** (24 formal, 18 informal)
- **3 batches**: "Pilot Study", "Main Collection", "Follow-up"
- **Realistic scores**: PETS ~45-55, TIAS ~50-65, Formality ~3.5-5.5
- **Time data**: 15 pages with realistic durations (e.g., Demographics: 45s, Voice Conversation: 180s)
- **5 no-consent feedback** entries with sample reasons

### Implementation Details

#### 1. Auth Context Changes
Add guest mode state and methods to `ResearcherAuthContext`:
- `isGuestMode` boolean flag
- `enterGuestMode()` function (sets flag, navigates to dashboard)
- `exitGuestMode()` function (clears flag, navigates to login)
- Modify `isAuthenticated` to return true when guest mode is active

#### 2. Login Page Updates
Add "View as Guest" button in `ResearcherLogin.tsx`:
- Styled as a secondary/outline button below the main form
- Descriptive text: "Explore the dashboard with sample data"
- Calls `enterGuestMode()` on click

#### 3. Protected Route Adjustment
Modify `ResearcherProtectedRoute` to allow guest access:
- Check `isGuestMode` alongside `isAuthenticated`
- Block admin-only routes for guests (user management, settings)

#### 4. Dashboard Header Updates
Update `ResearcherDashboard` header for guest mode:
- Show "Guest • Demo Mode" instead of email
- Replace logout button with "Exit Demo" button
- Hide admin-specific navigation buttons

#### 5. Create Dummy Data Provider
New file `src/lib/guest-dummy-data.ts` containing:
- Realistic participant responses (42 entries)
- Batch configurations (3 batches)
- Time analysis data (15 pages)
- No-consent feedback (5 entries)
- Activity logs (10 sample entries)
- Formality calculations (sample scores)

#### 6. Component Updates
Each dashboard component checks `isGuestMode` and uses dummy data:

| Component | Changes |
|-----------|---------|
| `DataSummary` | Return dummy stats instead of fetching |
| `UnifiedParticipantsTable` | Use dummy participants array |
| `TimeAnalysis` | Use dummy navigation events |
| `FormalityCalculator` | Show sample calculations |
| `PromptLab` | Display sample prompts (read-only) |
| `NoConsentFeedbackTable` | Use dummy feedback array |
| `ActivityLogsTable` | Show sample activity (hidden for guests anyway) |

#### 7. Restricted Features for Guests
- Download/Export buttons: Hidden
- Archive functionality: Hidden
- Batch management: Read-only (no starring, creating)
- User management: Route blocked
- Experiment settings: Route blocked
- Activity logs: Tab hidden

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/guest-dummy-data.ts` | **Create** - All dummy data generators |
| `src/contexts/ResearcherAuthContext.tsx` | **Modify** - Add guest mode state/methods |
| `src/pages/ResearcherLogin.tsx` | **Modify** - Add "View as Guest" button |
| `src/components/researcher/ResearcherProtectedRoute.tsx` | **Modify** - Allow guest access |
| `src/pages/ResearcherDashboard.tsx` | **Modify** - Guest header, hide admin tabs |
| `src/components/researcher/DataSummary.tsx` | **Modify** - Use dummy data in guest mode |
| `src/components/researcher/UnifiedParticipantsTable.tsx` | **Modify** - Use dummy data in guest mode |
| `src/components/researcher/TimeAnalysis.tsx` | **Modify** - Use dummy data in guest mode |
| `src/components/researcher/NoConsentFeedbackTable.tsx` | **Modify** - Use dummy data in guest mode |
| `src/components/researcher/BatchManager.tsx` | **Modify** - Read-only for guests |
| `src/components/researcher/FormalityCalculator.tsx` | **Modify** - Sample data for guests |
| `src/components/researcher/PromptLab.tsx` | **Modify** - Read-only samples for guests |

### Security Notes

- Guest mode uses only client-side state (no database involvement)
- No real data is ever exposed to guests
- RLS policies remain intact - guests never make authenticated requests
- Session storage used to persist guest mode across page refreshes
