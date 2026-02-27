# Admin Login Credentials & Troubleshooting

## Setting Up Admin Credentials

Admin credentials are stored in the `admin_users` database table.

**For development**, run the password reset script to create/update admin:

```bash
cd backend
npm run db:reset
```

This will:
1. Run pending migrations
2. Reset/create admin user with default development credentials

> **IMPORTANT**: Never commit real credentials to the repository.

## If Login Fails

### 1. Check Backend Server

Ensure the backend is running:

```bash
cd backend
npm run dev
```

### 2. Verify Database Connection

The backend should show:

```
✓ Redis connected
✓ Database connected
✓ Server running on http://localhost:3000
```

### 3. Reset Admin Password (if needed)

```bash
cd backend
npx tsx src/scripts/reset_admin_password.ts
```

## Admin Panel URL

**Local Development:** http://localhost:5173

## Common Issues

### "Invalid credentials"

- Run the password reset script
- Check that backend is using the correct database

### Connection refused

- Check if backend is running on port 3000
- Check if admin panel is running on port 5173

### Database errors

- Run migrations: `npm run migrate`
- Check Postgres is running: `docker ps`

## Environment Configuration

For development, copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

**Note**: The actual admin login uses the `admin_users` table in the database, not the `.env` variables.
