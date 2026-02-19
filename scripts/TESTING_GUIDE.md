# DTG App Testing Guide

## Two Ways to Test

### Option 1: USB Testing (Local Network)

Best for: Quick development, debugging with DevTools

```powershell
# 1. Start backend
cd backend
npm run dev

# 2. Run Flutter app via USB
cd mobile
flutter run
```

**For Android Emulator:**
```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

**For Physical Device (same WiFi):**
```powershell
# Find your computer's IP: ipconfig
flutter run --dart-define=API_BASE_URL=http://YOUR_IP:3000/api/v1
```

---

### Option 2: Cloudflare Tunnel (Internet Access)

Best for: Testing on devices not on same network, sharing with testers

**Step 1: Install cloudflared (one time)**
```powershell
winget install Cloudflare.cloudflared
```

**Step 2: Start the tunnel**
```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Tunnel
cloudflared tunnel --url http://localhost:3000
```

You'll see output like:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

**Step 3: Run app with tunnel URL**
```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=https://random-words-here.trycloudflare.com/api/v1
```

---

## Quick Reference

| Method | API URL Format |
|--------|----------------|
| iOS Simulator | `http://localhost:3000/api/v1` |
| Android Emulator | `http://10.0.2.2:3000/api/v1` |
| Physical Device (WiFi) | `http://192.168.x.x:3000/api/v1` |
| Cloudflare Tunnel | `https://xxx.trycloudflare.com/api/v1` |

---

## Admin Panel via Tunnel

To access admin panel through tunnel:

```powershell
# Terminal 1 - Admin panel
cd admin
npm run dev

# Terminal 2 - Admin tunnel (different port)
cloudflared tunnel --url http://localhost:5173
```

---

## Tips

1. **Keep USB debugging**: You don't lose USB testing when using tunnel
2. **Tunnel URLs change**: Each time you restart cloudflared, you get a new URL
3. **Free tier**: Quick tunnels are free, no Cloudflare account needed
4. **Permanent URL**: For a fixed URL, create a Cloudflare account and set up a named tunnel

---

## Troubleshooting

**CORS errors?**
- Backend now auto-allows `*.trycloudflare.com` domains
- Check that NODE_ENV=development in backend .env

**Connection refused?**
- Make sure backend is running on port 3000
- Check firewall isn't blocking the port

**Tunnel won't start?**
- Try: `cloudflared tunnel --url http://127.0.0.1:3000`
