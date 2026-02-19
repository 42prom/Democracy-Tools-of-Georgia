# Admin UI Specification

## Layout

- **Sidebar**: Dashboard, Create Poll, Drafts, Active Polls, History, Insights, Logs, Settings.
- **Top Bar**: Breadcrumbs, User Profile, "Switch Organization" (if multi-tenant).

## Page 1: Create Poll

- **Components**:
  - `TextInput`: Title, Description.
  - `DateRangePicker`: Start / End Time.
  - `OptionList`:
    - Row: [ DragHandle ] [ TextInput ] [ Remove(x) ]
    - Button: `+ Add Option` (Ghost variant).
  - `AudienceSelector`:
    - `Checkbox`: "All Ages" (checked by default).
    - `RangeSlider`: 18-100 (visible if unchecked).
    - `MultiSelect`: "Regions" (Searchable).
    - `Radio`: Gender (All, M, F).
  - `AudienceEstimateCard` (Right Panel):
    - State `Loading`: Spinner "Calculating Reach..."
    - State `Safe`: Green Check "Estimated Reach: 15,400 voters".
    - State `Unsafe`: Red Warning "Too small (count < 30). Cannot publish."
- **Buttons**:
  - `Save Draft` (Secondary).
  - `Publish` (Primary, triggers Confirmation Modal).
    - _Disabled_ if Title empty OR Options < 2 OR Audience Unsafe.

## Page 2: Active Polls

- **Components**:
  - `PollCard`:
    - Title, Status Badge ("Live"), Ends In timer.
    - Mini Chart (Participation rate).
    - Menu: [ View Details, Close Early ].

## Page 3: Security Logs

- **Components**:
  - `LogTable`:
    - cols: Timestamp, Event (Enroll, Vote), Severity, Status.
    - row_style: Red background for Severity=Critical.
  - `FilterBar`: Date Range, Event Type.

## States

- **Empty**: "No polls found. Create one to get started." (Illustration included).
- **Error**: "Failed to load estimate. Retry?" (Toast notification).
- **Loading**: Skeleton loaders on Table rows.
