# 🔧 TROUBLESHOOTING GUIDE: Cannot Save Regions & Cannot Publish Polls

## 🔍 ROOT CAUSE ANALYSIS

### Issue 1: Cannot Save Regions ❌
**Problem:** Regions CRUD operations fail because backend API endpoints don't exist.

**Frontend Calls:**
```typescript
// admin/src/api/client.ts
POST   /api/v1/admin/regions         // Create region
PATCH  /api/v1/admin/regions/:id     // Update region
DELETE /api/v1/admin/regions/:id     // Delete region
GET    /api/v1/admin/regions         // List regions
POST   /api/v1/admin/regions/import  // Import CSV
```

**Backend Status:** ❌ **NOT IMPLEMENTED**
- No `src/routes/admin/regions.ts` file exists
- No regions route registered in `src/index.ts`

---

### Issue 2: Cannot Publish Polls ❌
**Problem:** Poll operations may fail due to:
1. Backend not running
2. Missing database connection
3. Response format mismatch
4. Missing admin authentication

**Frontend Calls:**
```typescript
// admin/src/api/client.ts
POST   /api/v1/admin/polls           // Create poll
POST   /api/v1/admin/polls/estimate  // Estimate audience
PATCH  /api/v1/admin/polls/:id/publish  // Publish poll
```

**Backend Status:** ✅ **IMPLEMENTED** (in `src/routes/admin/polls.ts`)
- But may not be running or connected to database

---

## 🩺 DIAGNOSTIC STEPS

### Step 1: Check if Backend is Running
```bash
# Terminal 1: Check backend process
cd backend
npm run dev

# Expected output:
# ✓ Redis connected
# ✓ Server running on http://localhost:3000
# ✓ Environment: development
# ✓ Health check: http://localhost:3000/health

# If you see errors, go to Step 2
```

### Step 2: Test Backend Health
```bash
# Terminal 2: Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2026-01-30T...",
#   "services": {
#     "database": "connected",
#     "redis": "connected"
#   }
# }

# If connection refused → Backend not running (go to Step 3)
# If 500 error → Database/Redis issue (go to Step 4)
```

### Step 3: Start Backend
```bash
cd backend

# Install dependencies (first time)
npm install

# Start PostgreSQL + Redis
cd ..
docker-compose up -d

# Wait 10 seconds for services to start
sleep 10

# Run database migrations
cd backend
npm run migrate

# Start backend server
npm run dev
```

### Step 4: Check Database Connection
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test PostgreSQL connection
docker exec -it dtfg-db psql -U dtfg -d dtfg_db -c "SELECT 1;"

# Expected output: 1

# Check if Redis is running
docker ps | grep redis

# Test Redis connection
docker exec -it dtfg-redis redis-cli ping

# Expected output: PONG

# If services not running:
docker-compose down
docker-compose up -d
```

---

## 🛠️ SOLUTIONS

### Solution 1: Implement Missing Regions Backend (Required)

#### Create Regions Routes
Create file: `backend/src/routes/admin/regions.ts`

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';
import { pool } from '../../db/client';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All admin routes require authentication
router.use(requireAdmin);

/**
 * GET /api/v1/admin/regions
 * List all regions
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT * FROM regions ORDER BY name_en ASC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/regions
 * Create a new region
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, name_en, name_ka, parent_region_id, active } = req.body;

    if (!code || !name_en || !name_ka) {
      throw createError('Code, name_en, and name_ka are required', 400);
    }

    const result = await pool.query(
      `INSERT INTO regions (code, name_en, name_ka, parent_region_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code, name_en, name_ka, parent_region_id || null, active ?? true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/admin/regions/:id
 * Update a region
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { code, name_en, name_ka, parent_region_id, active } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (code !== undefined) {
      updates.push(`code = $${paramCount++}`);
      values.push(code);
    }
    if (name_en !== undefined) {
      updates.push(`name_en = $${paramCount++}`);
      values.push(name_en);
    }
    if (name_ka !== undefined) {
      updates.push(`name_ka = $${paramCount++}`);
      values.push(name_ka);
    }
    if (parent_region_id !== undefined) {
      updates.push(`parent_region_id = $${paramCount++}`);
      values.push(parent_region_id);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      throw createError('No fields to update', 400);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE regions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw createError('Region not found', 404);
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/regions/:id
 * Delete a region
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM regions WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      throw createError('Region not found', 404);
    }

    res.json({ message: 'Region deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/regions/import
 * Import regions from CSV
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw createError('CSV file is required', 400);
    }

    const regions: any[] = [];
    const errors: string[] = [];
    const csvData = req.file.buffer.toString('utf-8');

    // Parse CSV
    await new Promise((resolve, reject) => {
      const stream = Readable.from(csvData);
      stream
        .pipe(csvParser())
        .on('data', (row: any) => {
          // Validate row
          if (!row.code || !row.name_en || !row.name_ka) {
            errors.push(`Invalid row: ${JSON.stringify(row)}`);
            return;
          }
          regions.push({
            code: row.code,
            name_en: row.name_en,
            name_ka: row.name_ka,
            parent_region_id: row.parent_region_id || null,
            active: row.active === 'true' || row.active === '1',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Insert regions
    let imported = 0;
    for (const region of regions) {
      try {
        await pool.query(
          `INSERT INTO regions (code, name_en, name_ka, parent_region_id, active)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO UPDATE
           SET name_en = EXCLUDED.name_en,
               name_ka = EXCLUDED.name_ka,
               parent_region_id = EXCLUDED.parent_region_id,
               active = EXCLUDED.active`,
          [region.code, region.name_en, region.name_ka, region.parent_region_id, region.active]
        );
        imported++;
      } catch (err: any) {
        errors.push(`Failed to import ${region.code}: ${err.message}`);
      }
    }

    res.json({ imported, errors });
  } catch (error) {
    next(error);
  }
});

export default router;
```

#### Register Regions Routes
Update file: `backend/src/index.ts`

```typescript
// Add this import at the top
import regionsRouter from './routes/admin/regions';

// Add this route after line 33
app.use('/api/v1/admin/regions', regionsRouter);
```

#### Install Required Dependencies
```bash
cd backend
npm install multer csv-parser
npm install --save-dev @types/multer @types/csv-parser
```

#### Create Regions Table (if not exists)
```bash
# Check if regions table exists
docker exec -it dtfg-db psql -U dtfg -d dtfg_db -c "\\dt regions"

# If not exists, create it:
docker exec -it dtfg-db psql -U dtfg -d dtfg_db <<EOF
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ka VARCHAR(255) NOT NULL,
  parent_region_id UUID REFERENCES regions(id),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regions_code ON regions(code);
CREATE INDEX idx_regions_active ON regions(active);
EOF
```

---

### Solution 2: Fix Poll Publishing Issues

#### Check Backend Response Format
The backend returns:
```json
{ "poll": { ...pollData } }
```

But frontend expects:
```json
{ ...pollData }
```

**Fix:** Update `backend/src/routes/admin/polls.ts` line 29:
```typescript
// Change from:
res.status(201).json({ poll });

// To:
res.status(201).json(poll);
```

#### Check Poll Publish Response
Update `backend/src/routes/admin/polls.ts` line 67:
```typescript
// Change from:
res.json({ message: 'Poll published successfully' });

// To:
const result = await publishPoll(id);
res.json(result);
```

#### Implement Missing Backend Methods
Check `backend/src/services/polls.ts` and ensure these methods exist:
- `createPoll(data)` - Creates poll with rewards fields
- `estimateAudience(rules)` - Estimates audience size
- `publishPoll(id)` - Publishes poll

---

## ✅ VERIFICATION STEPS

### Test Regions Endpoints
```bash
# 1. List regions (should be empty initially)
curl http://localhost:3000/api/v1/admin/regions \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Create a region
curl -X POST http://localhost:3000/api/v1/admin/regions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "reg_tbilisi",
    "name_en": "Tbilisi",
    "name_ka": "თბილისი",
    "active": true
  }'

# Expected: 201 Created with region data

# 3. Test in admin UI
# - Open http://localhost:5173/settings/regions
# - Click "Add Region"
# - Fill form and click "Create"
# - Should see success alert
```

### Test Poll Publishing
```bash
# 1. Create poll
curl -X POST http://localhost:3000/api/v1/admin/polls \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Poll",
    "type": "survey",
    "options": ["Option 1", "Option 2"],
    "audience_rules": {},
    "rewards_enabled": true,
    "reward_amount": 10,
    "reward_token": "DTFG"
  }'

# Expected: 201 Created with poll ID

# 2. Publish poll
curl -X PATCH http://localhost:3000/api/v1/admin/polls/POLL_ID/publish \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 200 OK

# 3. Test in admin UI
# - Open http://localhost:5173/create-poll
# - Fill form
# - Click "Estimate Audience"
# - Click "Publish"
# - Should see success alert
```

---

## 🚀 QUICK FIX SCRIPT

Run this to set up everything:

```bash
#!/bin/bash
# fix-backend.sh

echo "🔧 Setting up DTFG Backend..."

# 1. Start services
echo "📦 Starting PostgreSQL + Redis..."
docker-compose up -d
sleep 10

# 2. Install dependencies
echo "📚 Installing backend dependencies..."
cd backend
npm install multer csv-parser
npm install --save-dev @types/multer @types/csv-parser

# 3. Create regions table
echo "🗄️ Creating regions table..."
docker exec -it dtfg-db psql -U dtfg -d dtfg_db <<EOF
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ka VARCHAR(255) NOT NULL,
  parent_region_id UUID REFERENCES regions(id),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);
CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(active);
EOF

# 4. Start backend
echo "🚀 Starting backend server..."
npm run dev

echo "✅ Setup complete!"
echo "📍 Backend: http://localhost:3000"
echo "📍 Admin:   http://localhost:5173"
```

Save as `fix-backend.sh` and run:
```bash
chmod +x fix-backend.sh
./fix-backend.sh
```

---

## 📋 CHECKLIST

Before testing, ensure:

- [ ] Docker is running
- [ ] PostgreSQL container is up (`docker ps | grep dtfg-db`)
- [ ] Redis container is up (`docker ps | grep dtfg-redis`)
- [ ] Backend dependencies installed (`npm install` in backend/)
- [ ] Regions routes file created (`backend/src/routes/admin/regions.ts`)
- [ ] Regions routes registered in `backend/src/index.ts`
- [ ] Regions table exists in database
- [ ] Backend server running (`npm run dev` in backend/)
- [ ] Backend health check passes (`curl http://localhost:3000/health`)
- [ ] Admin panel running (`npm run dev` in admin/)
- [ ] Browser console shows no CORS errors

---

## 🆘 STILL NOT WORKING?

### Check Browser Console
1. Open admin panel: http://localhost:5173
2. Press F12 → Console tab
3. Try to save a region or publish a poll
4. Look for error messages:

**If you see:**
- `Network Error` → Backend not running
- `CORS policy` → Backend CORS not configured
- `401 Unauthorized` → No admin token in localStorage
- `404 Not Found` → Route not registered
- `500 Internal Server Error` → Check backend logs

### Check Backend Logs
```bash
# Terminal with backend running
# Look for errors when you click "Save" or "Publish"

# Example good request:
# POST /api/v1/admin/regions 201 - 45ms

# Example bad request:
# POST /api/v1/admin/regions 500 - Error: ...
```

### Get Admin Token (Mock)
```bash
# Set admin token in browser console:
# Press F12 → Console → Run:
localStorage.setItem('admin_token', 'mock_admin_token');

# Reload page
```

### Reset Everything
```bash
# Stop all containers
docker-compose down -v

# Remove node_modules
rm -rf backend/node_modules admin/node_modules

# Start fresh
docker-compose up -d
cd backend && npm install && npm run migrate
cd ../admin && npm install
```

---

## 📞 NEED MORE HELP?

1. Check backend logs for specific errors
2. Check browser console for API errors
3. Verify database schema matches expected structure
4. Test backend endpoints directly with curl
5. Ensure all environment variables are set correctly

**Common Environment Variables:**
```env
# .env file in backend/
DATABASE_URL=postgresql://dtfg:dtfg@localhost:5432/dtfg_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key_here
PORT=3000
NODE_ENV=development
```
