

# Plan: Unified Participant View with Journey Timeline

## Overview
Merge the "Responses" and "Calls" tabs into a single "Participants" tab that shows all participants with their completion status, with the ability to view individual journey timelines. Also add search/filter capabilities to the Time Analysis tab.

---

## Part 1: Create New Unified Participants Tab

### Current State
- **Responses tab**: Shows only completed participants (those with `experiment_responses` records)
- **Calls tab**: Shows all participants who started (those with `participant_calls` records)
- Data is siloed - researchers must switch between tabs to see the full picture

### New Behavior
Create a new `UnifiedParticipantsTable` component that:
- Fetches from `participant_calls` as the base table (captures everyone who entered a Prolific ID)
- Left joins to `experiment_responses` to determine completion status
- Left joins to `demographics` for demographic data on completed participants
- Adds a **Status column** with values: "Completed" (has experiment_responses) or "Pending" (no experiment_responses)
- **Default filter**: Show "Completed" participants only, but easily toggle to see all
- Retains all existing filtering, sorting, column visibility features from the current Responses table

### Table Columns
| Column | Source | Notes |
|--------|--------|-------|
| Prolific ID | participant_calls | Always available |
| Status | Derived | "Completed" or "Pending" |
| Created At | participant_calls | When they started |
| Condition | experiment_responses | Only for completed |
| Batch | experiment_responses | Only for completed |
| PETS Total | experiment_responses | Only for completed |
| TIAS Total | experiment_responses | Only for completed |
| ... other scores | experiment_responses | Only for completed |
| Actions | - | View Details, View Journey, Archive |

---

## Part 2: Participant Journey Timeline Component

### New Component: `ParticipantJourneyModal`
A modal/dialog that shows a participant's complete navigation journey:

```text
+--------------------------------------------------+
|  Journey Timeline: [Prolific ID]                 |
|  Status: Completed | Condition: Formal           |
+--------------------------------------------------+
|                                                  |
|  [TIMELINE VIEW]                                 |
|                                                  |
|  ○ Consent                                       |
|  │   Arrived: Jan 19, 2026 2:15:00 PM            |
|  │   Time spent: 43s                             |
|  │                                               |
|  ○ Prolific ID                                   |
|  │   Arrived: Jan 19, 2026 2:15:43 PM            |
|  │   Time spent: 12s                             |
|  │                                               |
|  ○ Demographics                                  |
|  │   Arrived: Jan 19, 2026 2:15:55 PM            |
|  │   Time spent: 1m 26s                          |
|  │   ⚠ Back button clicked                       |
|  │                                               |
|  ○ Voice Assistant Familiarity                   |
|  │   ...                                         |
|  │                                               |
|  ● Complete (Final page reached)                 |
|     Arrived: Jan 19, 2026 2:45:00 PM             |
|     Total journey time: ~30 minutes              |
|                                                  |
+--------------------------------------------------+
|  [Close]                              [Export]   |
+--------------------------------------------------+
```

### Data Source
Query `navigation_events` filtered by `prolific_id`:
- Order by `created_at` ascending (chronological)
- Show `page_name`, `time_on_page_seconds`, `event_type` (page_leave or back_button_click)
- Calculate arrival time from the previous row's leave time
- Highlight any back button clicks as potential issues

### Access Points
1. **From Participants Table**: "View Journey" action button (available for all participants)
2. **From Response Details Page**: Add new "Journey" section showing the timeline

---

## Part 3: Add Search to Time Analysis Tab

### Enhancement
Add a search/filter section to the existing `TimeAnalysis` component:
- Search box to filter by Prolific ID
- When a specific participant is selected, show their individual time breakdown instead of aggregate averages
- Toggle between "Aggregate View" and "Individual View"
- Quick link to open the full Journey Modal

---

## Part 4: Update Dashboard Navigation

### Tab Changes in `ResearcherDashboard.tsx`
```text
BEFORE:                          AFTER:
- Summary                        - Summary
- Responses  <-- remove          - Participants  <-- new unified tab
- Calls      <-- remove          - Time Analysis
- Time Analysis                  - Formality
- Formality                      - Prompts
- Prompts                        - Batches
- Batches                        - No Consent
- No Consent                     - Activity (super admin)
- Activity (super admin)         - Archived (super admin)
- Archived (super admin)         - Settings (super admin)
- Settings (super admin)
```

---

## Technical Implementation Details

### Database Queries

**Unified Participants Query:**
```sql
SELECT 
  pc.id,
  pc.prolific_id,
  pc.call_id,
  pc.created_at,
  pc.token_used,
  er.id as response_id,
  er.assistant_type,
  er.batch_label,
  er.pets_total,
  er.tias_total,
  -- ... other experiment_responses columns
  d.age,
  d.gender,
  d.ethnicity
FROM participant_calls pc
LEFT JOIN experiment_responses er ON pc.call_id = er.call_id
LEFT JOIN demographics d ON pc.prolific_id = d.prolific_id
ORDER BY pc.created_at DESC
```

**Journey Data Query:**
```sql
SELECT 
  page_name,
  event_type,
  time_on_page_seconds,
  created_at,
  metadata
FROM navigation_events
WHERE prolific_id = '[selected_id]'
ORDER BY created_at ASC
```

### Files to Create
1. `src/components/researcher/UnifiedParticipantsTable.tsx` - New merged table component
2. `src/components/researcher/ParticipantJourneyModal.tsx` - Timeline visualization component

### Files to Modify
1. `src/pages/ResearcherDashboard.tsx` - Replace Responses/Calls tabs with unified Participants tab
2. `src/pages/ResponseDetails.tsx` - Add Journey section
3. `src/components/researcher/TimeAnalysis.tsx` - Add search and individual participant view

### Migration Path
- Keep the existing `ExperimentResponsesTable.tsx` and `ParticipantCallsTable.tsx` initially (can remove later)
- The new unified table will import and adapt patterns from both

---

## Summary of Changes

| Change | Description |
|--------|-------------|
| New unified tab | Single "Participants" tab replaces separate Responses and Calls tabs |
| Status filter | Default shows "Completed", toggle to see "Pending" (dropouts) |
| Journey timeline | Visual timeline showing each page visited with timestamps |
| Back button tracking | Highlight when participants clicked back (potential issues) |
| Time Analysis search | Search for specific participant to see their individual times |
| Response Details enhancement | Add Journey section to existing detail view |

