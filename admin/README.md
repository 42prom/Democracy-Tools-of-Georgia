# DTFG Admin Panel

Admin web interface for Democratic Tools for Georgia voting system.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **React Router** for navigation
- **TailwindCSS** for styling
- **Axios** for API calls
- **Lucide React** for icons
- **date-fns** for date formatting
- **Recharts** for data visualization

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173)

API requests are proxied to `http://localhost:3000` (backend server).

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
admin/
├── src/
│   ├── api/          # API client and endpoints
│   ├── components/   # Reusable components
│   │   ├── ui/       # UI primitives (Button, Input, Card, etc.)
│   │   └── Layout.tsx
│   ├── pages/        # Page components
│   │   ├── CreatePoll.tsx
│   │   ├── DraftedPolls.tsx
│   │   ├── ActivePolls.tsx
│   │   ├── VotingHistory.tsx
│   │   ├── SettingsRegions.tsx
│   │   ├── SecurityLogs.tsx
│   │   └── Dashboard.tsx
│   ├── types/        # TypeScript type definitions
│   ├── App.tsx       # Root app component
│   ├── main.tsx      # Entry point
│   └── index.css     # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Pages

### Create Poll
- Poll title, description, type
- Dynamic option list with drag-and-drop support
- Date range picker for start/end times
- Audience selector (age, gender, regions)
- Real-time audience estimation with privacy check
- Save as draft or publish directly

### Drafted Polls
- List of draft polls
- Edit, publish, or delete drafts
- Poll metadata display

### Active Polls
- Grid of active polls with live status
- Participation rate visualization
- Time remaining countdown
- Quick actions (View Details, Close Early)

### Voting History
- List of closed polls
- Aggregated results with k-anonymity protection
- Demographic breakdowns (if available)
- Cell suppression for privacy

### Settings - Regions
- Table of available regions
- Region codes and names (English/Georgian)
- Parent region relationships

### Security Logs
- Aggregated security events
- Severity-based filtering and styling
- K-anonymity protected counts
- Date range filtering

## API Integration

All API calls use the OpenAPI v1 endpoints from the backend:

- `POST /api/v1/admin/polls` - Create poll
- `POST /api/v1/admin/polls/estimate` - Estimate audience
- `PATCH /api/v1/admin/polls/:id/publish` - Publish poll
- `GET /api/v1/admin/polls` - List polls (with status filter)
- `GET /api/v1/analytics/polls/:id/results` - Get poll results
- `GET /api/v1/admin/security-events/summary` - Get security events

## Privacy Features

- **K-Anonymity Enforcement**: Audience estimator checks minimum threshold (k=30)
- **Result Suppression**: Poll results hide cells with count < k
- **Complementary Suppression**: Prevents inference via subtraction
- **Aggregated Events**: Security logs show only aggregated counts, no PII

## Mock Authentication

For Phase 0, authentication is mocked. A bearer token is stored in `localStorage` and sent with admin API requests.

## Environment

Development server proxies API requests to `http://localhost:3000`. Update `vite.config.ts` to change the backend URL.

## License

Proprietary - Democratic Tools for Georgia
