# Plan: Evolve Survey Poll Type with Questions, Sub-Options & Text Responses

## Problem

Currently, polls (including surveys) support only a flat list of options with single-select radio buttons. For the **survey** poll type, this is insufficient. A premium survey system needs:
- Multiple question types (not just single choice)
- Sub-options for each question
- Free text input capability
- Proper analytics and charts for each response type

## Current Architecture

| Layer | Current State |
|-------|--------------|
| **Database** | `poll_options` = flat list (text + display_order). `votes` = one option_id per user per poll |
| **Backend** | Creates options as simple strings. Results = COUNT GROUP BY option_id |
| **Admin UI** | Options are text inputs in a list. Results shown as progress bars |
| **Mobile App** | Radio buttons for single select. One selection per poll |
| **Privacy** | k-anonymity (k=30) on all aggregated results. Nullifier prevents double-vote |

## Proposed Architecture

### New Database Schema

**Migration 006: Survey Questions System**

```sql
-- Survey questions table (one survey poll → many questions)
CREATE TABLE survey_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN (
        'single_choice',    -- Radio buttons (existing behavior)
        'multiple_choice',  -- Checkboxes (select many)
        'text',             -- Free text input
        'rating_scale',     -- 1-5 or 1-10 scale
        'ranked_choice'     -- Drag-to-rank options
    )),
    required BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    config JSONB DEFAULT '{}',
    -- config examples:
    --   rating_scale: { "min": 1, "max": 5, "minLabel": "Strongly Disagree", "maxLabel": "Strongly Agree" }
    --   text:         { "maxLength": 500, "placeholder": "Your thoughts..." }
    --   ranked_choice: { "maxRanks": 3 }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Options for choice-type questions (single_choice, multiple_choice, ranked_choice)
CREATE TABLE question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    display_order INT DEFAULT 0
);

-- Survey responses (ANONYMOUS - same privacy model as votes)
-- Each response is independent per question (no cross-question correlation stored)
CREATE TABLE survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id),
    question_id UUID NOT NULL REFERENCES survey_questions(id),

    -- Response data (only one populated per row based on question type)
    selected_option_id UUID REFERENCES question_options(id),  -- single_choice
    selected_option_ids UUID[],                                -- multiple_choice
    text_response TEXT,                                        -- text (stored but only shown aggregated)
    rating_value INT CHECK (rating_value >= 1 AND rating_value <= 10), -- rating_scale
    ranked_option_ids UUID[],                                  -- ranked_choice (ordered array)

    -- Demographics snapshot for per-question analytics
    demographics_snapshot JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Survey nullifiers (prevent double submission for entire survey)
CREATE TABLE survey_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (poll_id, nullifier_hash)
);

CREATE INDEX idx_survey_questions_poll ON survey_questions(poll_id);
CREATE INDEX idx_question_options_question ON question_options(question_id);
CREATE INDEX idx_survey_responses_poll ON survey_responses(poll_id);
CREATE INDEX idx_survey_responses_question ON survey_responses(question_id);
```

**Key Design Decisions:**
- Election/referendum polls keep using existing `poll_options` + `votes` tables (no changes)
- Survey polls use new `survey_questions` + `question_options` + `survey_responses` tables
- Text responses are stored but NEVER shown individually (privacy) — only word frequency / response count
- Each question's responses are analyzed independently (no cross-question joins in analytics)

### Implementation Steps

---

## Step 1: Database Migration

**File:** `db/migrations/006_survey_questions.sql`

Create tables: `survey_questions`, `question_options`, `survey_responses`, `survey_nullifiers`

---

## Step 2: Backend Types & API

**Files to modify/create:**
- `backend/src/types/survey.ts` (NEW)
- `backend/src/routes/admin/polls.ts` (MODIFY)
- `server/src/services/analytics.ts` (MODIFY)

### 2a. New Types

```typescript
// backend/src/types/survey.ts
interface SurveyQuestion {
  id?: string;
  questionText: string;
  questionType: 'single_choice' | 'multiple_choice' | 'text' | 'rating_scale' | 'ranked_choice';
  required: boolean;
  displayOrder: number;
  config: Record<string, any>;
  options?: QuestionOption[];  // For choice types only
}

interface QuestionOption {
  id?: string;
  optionText: string;
  displayOrder: number;
}

interface SurveySubmission {
  pollId: string;
  nullifier: string;
  responses: QuestionResponse[];
  demographicsSnapshot: Record<string, any>;
}

interface QuestionResponse {
  questionId: string;
  selectedOptionId?: string;       // single_choice
  selectedOptionIds?: string[];    // multiple_choice
  textResponse?: string;           // text
  ratingValue?: number;            // rating_scale
  rankedOptionIds?: string[];      // ranked_choice
}
```

### 2b. New API Endpoints

```
POST   /api/v1/admin/polls              — Extended to accept survey questions when type='survey'
GET    /api/v1/admin/polls/:id          — Returns survey questions if type='survey'
POST   /api/v1/polls/:id/survey-submit  — Submit survey responses (mobile app)
GET    /api/v1/analytics/polls/:id/survey-results  — Survey-specific analytics
```

### 2c. Poll Creation Logic Changes

When `type === 'survey'`:
- Accept `questions` array instead of `options` array
- Each question has `questionType`, `questionText`, `required`, `config`
- Choice-type questions include nested `options` array
- Store in `survey_questions` + `question_options` tables
- Still store legacy `poll_options` from question texts (for backward compatibility display)

---

## Step 3: Admin Frontend - Create Poll Page

**File:** `admin/src/pages/CreatePoll.tsx` (MAJOR MODIFICATION)

### Changes when `pollType === 'survey'`:

Replace the flat "Options" card with a **"Survey Questions"** builder:

```
┌──────────────────────────────────────────────────────┐
│ Survey Questions                                     │
│                                                      │
│ ┌─ Question 1 ─────────────────────────────────────┐ │
│ │ Type: [Single Choice ▼]  Required: [✓]           │ │
│ │ Question: [What is your preferred policy?      ]  │ │
│ │                                                   │ │
│ │ Options:                                          │ │
│ │   ○ [Option A                        ] [×]       │ │
│ │   ○ [Option B                        ] [×]       │ │
│ │   ○ [Option C                        ] [×]       │ │
│ │   + Add Option                                    │ │
│ └───────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Question 2 ─────────────────────────────────────┐ │
│ │ Type: [Text Response ▼]  Required: [✓]           │ │
│ │ Question: [Please explain your reasoning       ]  │ │
│ │                                                   │ │
│ │ Max Length: [500]  Placeholder: [Your thoughts..] │ │
│ └───────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Question 3 ─────────────────────────────────────┐ │
│ │ Type: [Rating Scale ▼]   Required: [✓]           │ │
│ │ Question: [How satisfied are you?              ]  │ │
│ │                                                   │ │
│ │ Scale: [1] to [5]                                 │ │
│ │ Min Label: [Very Poor]  Max Label: [Excellent]    │ │
│ └───────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Question 4 ─────────────────────────────────────┐ │
│ │ Type: [Multiple Choice ▼] Required: [ ]          │ │
│ │ Question: [Select all that apply              ]   │ │
│ │                                                   │ │
│ │ Options:                                          │ │
│ │   ☐ [Healthcare                      ] [×]       │ │
│ │   ☐ [Education                       ] [×]       │ │
│ │   ☐ [Economy                         ] [×]       │ │
│ │   + Add Option                                    │ │
│ └───────────────────────────────────────────────────┘ │
│                                                      │
│ [+ Add Question]                                     │
└──────────────────────────────────────────────────────┘
```

For Election/Referendum: Keep existing flat options UI (no changes).

---

## Step 4: Admin Frontend - Survey Results & Analytics

**File:** `admin/src/pages/PollDetails.tsx` (MAJOR MODIFICATION)

### New Results Display per Question Type:

**Single Choice Results:**
```
Q1: What is your preferred policy?
  Option A  ████████████████████  45% (135 votes)
  Option B  ██████████            25% (75 votes)
  Option C  ████████████          30% (90 votes)
```

**Multiple Choice Results:**
```
Q2: Select all that apply (respondents could select multiple)
  Healthcare  ████████████████████████  72% selected
  Education   ██████████████████        55% selected
  Economy     ████████████████████      62% selected
```

**Rating Scale Results:**
```
Q3: How satisfied are you? (Average: 3.8/5)
  ★☆ 1  ██         5%
  ★★ 2  ████       12%
  ★★★ 3  ████████   22%
  ★★★★ 4  ████████████████  38%
  ★★★★★ 5  ██████████  23%
```

**Text Response Results:**
```
Q4: Please explain your reasoning
  📝 285 responses collected
  [Privacy Notice: Individual responses are not displayed to protect respondent anonymity]

  Top Keywords: economy (45), education (38), healthcare (32), reform (28)
  [Export anonymized responses (restricted)]
```

**Ranked Choice Results:**
```
Q5: Rank your priorities
  1st Place Wins:
    Education  ████████████████████  42%
    Healthcare ██████████████        33%
    Economy    ██████████            25%
```

---

## Step 5: Mobile App - Survey Voting Screen

**Files to modify/create:**
- `mobile/lib/models/poll.dart` (MODIFY - add question types)
- `mobile/lib/screens/voting/survey_screen.dart` (NEW)
- `mobile/lib/screens/voting/poll_details_screen.dart` (MODIFY - route to survey screen for surveys)

### Survey Screen Flow:

```
┌─────────────────────────────────┐
│ Survey: City Improvements       │
│ Question 1 of 4                 │
│ ▬▬▬▬▬▬▬▬░░░░░░░░  (25%)       │
│                                 │
│ What is your preferred policy?  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ◉ Option A                  │ │
│ ├─────────────────────────────┤ │
│ │ ○ Option B                  │ │
│ ├─────────────────────────────┤ │
│ │ ○ Option C                  │ │
│ └─────────────────────────────┘ │
│                                 │
│         [Next Question →]       │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Survey: City Improvements       │
│ Question 2 of 4                 │
│ ▬▬▬▬▬▬▬▬▬▬▬▬░░░░  (50%)       │
│                                 │
│ Please explain your reasoning:  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ I think the city should     │ │
│ │ focus on improving public   │ │
│ │ transportation because...   │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│ 127/500 characters              │
│                                 │
│    [← Back]  [Next Question →]  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Survey: City Improvements       │
│ Question 3 of 4                 │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░  (75%)       │
│                                 │
│ How satisfied are you with      │
│ current services?               │
│                                 │
│   1    2    3    4    5         │
│  😞   😕   😐   🙂   😊        │
│  [ ]  [ ]  [ ]  [●]  [ ]       │
│                                 │
│ Very Poor ←──────→ Excellent    │
│                                 │
│    [← Back]  [Next Question →]  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Survey: City Improvements       │
│ Question 4 of 4                 │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (100%)      │
│                                 │
│ Select all that apply:          │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ☑ Healthcare                │ │
│ ├─────────────────────────────┤ │
│ │ ☑ Education                 │ │
│ ├─────────────────────────────┤ │
│ │ ☐ Economy                   │ │
│ └─────────────────────────────┘ │
│                                 │
│    [← Back]  [Submit Survey →]  │
└─────────────────────────────────┘
```

---

## Step 6: Analytics Service Updates

**File:** `server/src/services/analytics.ts` (MODIFY)

### New Analytics Functions:

```typescript
// Survey-specific results
async function getSurveyResults(pollId: string): Promise<SurveyResultsResponse> {
  // For each question:
  //   single_choice  → COUNT GROUP BY selected_option_id (same as current)
  //   multiple_choice → COUNT per option (each option counted independently)
  //   text           → Response count only + keyword extraction (no raw text exposed)
  //   rating_scale   → AVG, distribution histogram, COUNT per value
  //   ranked_choice  → Weighted score (1st=5pts, 2nd=4pts...) + 1st-place wins

  // All results subject to k-anonymity suppression
}
```

### Privacy Rules for Text Responses:
- Individual text responses are NEVER returned in API
- Only aggregate metrics: response count, average length
- Optional: keyword frequency analysis (only keywords appearing 5+ times)
- Text responses can be exported by admin with restricted access + audit log

---

## Step 7: Backward Compatibility

- **Election** and **Referendum** polls continue using existing `poll_options` + `votes` tables — zero changes
- **Survey** polls use new `survey_questions` + `question_options` + `survey_responses` tables
- The `poll.type` field determines which tables/UI to use
- Admin CreatePoll page conditionally renders old vs new UI based on poll type
- Mobile app routes to existing `PollDetailsScreen` for election/referendum, new `SurveyScreen` for survey

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `db/migrations/006_survey_questions.sql` | NEW | Create survey_questions, question_options, survey_responses, survey_nullifiers tables |
| `admin/src/types/index.ts` | MODIFY | Add SurveyQuestion, QuestionOption, SurveyResults types |
| `admin/src/pages/CreatePoll.tsx` | MODIFY | Add survey question builder UI when type='survey' |
| `admin/src/pages/PollDetails.tsx` | MODIFY | Add survey results visualization per question type |
| `admin/src/api/client.ts` | MODIFY | Add survey API endpoints |
| `backend/src/types/survey.ts` | NEW | Survey-specific TypeScript types |
| `backend/src/routes/admin/polls.ts` | MODIFY | Handle survey question creation/retrieval |
| `backend/src/routes/polls.ts` | MODIFY | Add survey submission endpoint |
| `server/src/services/analytics.ts` | MODIFY | Add survey results aggregation with k-anonymity |
| `server/src/routes/analytics.ts` | MODIFY | Add survey results endpoint |
| `mobile/lib/models/poll.dart` | MODIFY | Add SurveyQuestion, QuestionOption models |
| `mobile/lib/models/survey_response.dart` | NEW | Survey response model |
| `mobile/lib/screens/voting/survey_screen.dart` | NEW | Multi-question survey voting screen |
| `mobile/lib/screens/voting/poll_details_screen.dart` | MODIFY | Route survey polls to SurveyScreen |
| `mobile/lib/services/api/poll_api_service.dart` | MODIFY | Add survey submission API call |
