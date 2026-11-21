# Complete Guide: Hosting Sales Reply AI on Render (Free Plan)

**Sales Reply AI** — https://salesreplyai.codexanta.bond
Developed by **Codexanta**.

The connected `insaf-ai-whatsapp` Supabase project (Singapore / `ap-southeast-1`) is active. Its required tables are already present and its migrations are applied, so do **not** rerun SQL against that project. `supabase/schema.sql` is included for a separate, brand-new Supabase project only.

---

## Step 1: Upload the project to GitHub

Render deploys Node.js apps directly from GitHub (free).

1. Create a **new Private repository** on GitHub (e.g., `sales-reply-ai-whatsapp-system`).
   > Keep the repo **Private** if you ever push keys. `.gitignore` already excludes `.env` and `node_modules/`.
2. Extract the `sales-reply-ai.zip` package into a folder named `sales-reply-ai`.
3. Push the code:

   ```bash
   cd sales-reply-ai
   git init
   git add .
   git commit -m "Initial Sales Reply AI system"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sales-reply-ai-whatsapp-system.git
   git push -u origin main
   ```

---

## Step 2: Create the free Web Service on Render

1. Go to https://dashboard.render.com and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your repository (`sales-reply-ai-whatsapp-system`).
4. Configure:

   - **Name:** `sales-reply-ai-full-system`
   - **Region:** `Singapore`
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free ($0/month)
   - **Health Check Path:** `/health`

---

## Step 3: Add environment variables

Copy the real Supabase values from the local-only `RENDER_ENV_VARS.txt` into Render's Environment page. The file is ignored by Git because it contains the service-role secret; never upload or commit it. `render.yaml` defines the variable names but leaves sensitive values unsynced. Facebook app secret and Page access token must be obtained from Meta if you enable Messenger.

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://salesreplyai.codexanta.bond` |
| `SUPABASE_URL` | use the value in local `RENDER_ENV_VARS.txt` |
| `SUPABASE_ANON_KEY` | use the value in local `RENDER_ENV_VARS.txt` |
| `SUPABASE_SERVICE_ROLE_KEY` | use the value in local `RENDER_ENV_VARS.txt` — keep private |
| `DEFAULT_AI_PROVIDER` | `gemini` |
| `DEFAULT_AI_MODEL` | `gemini-2.5-flash` |
| `FACEBOOK_VERIFY_TOKEN` | your chosen verify token |

Optional: `DEFAULT_AI_API_KEY` (fallback AI key), `FACEBOOK_APP_SECRET`, `FACEBOOK_PAGE_ACCESS_TOKEN`.

Click **Deploy Web Service** and wait ~1–2 minutes.

---

## Step 4: Verify the deployment

Once Render shows **Live**:

1. Open `https://YOUR-APP.onrender.com/health` — you should see:
   ```json
   { "status": "ok", "service": "sales-reply-ai-full-system-v2", ... }
   ```
2. Open `https://YOUR-APP.onrender.com` — the Sales Reply AI landing page loads.
3. Register at `/register` and open `/dashboard`.

---

## Step 5: Connect the domain

1. In Render → **Settings → Custom Domains**, add `salesreplyai.codexanta.bond`.
2. Point the DNS (CNAME or A record) to the Render-provided target.
3. Add `APP_URL=https://salesreplyai.codexanta.bond` as an environment variable so widget/embed URLs and AI referers use the correct domain.
4. In Supabase → **Authentication → URL Configuration → Redirect URLs**, add `https://salesreplyai.codexanta.bond/**` (and keep `http://localhost:3000/**` for local development).

---

## Step 6: Keep the Render free plan awake

Render's free plan sleeps after ~15 minutes of no traffic, which disconnects the WhatsApp WebSocket.

1. WhatsApp session credentials are stored in Supabase Postgres (`whatsapp_auth_keys`) — the server restores them automatically on boot; no QR rescan is needed after a restart.
2. Set up a free monitor (UptimeRobot or cron-job.org) to ping `https://salesreplyai.codexanta.bond/health` every **5 minutes**.

---

## Security note

The real `RENDER_ENV_VARS.txt` exists only in the local workspace and is ignored by Git. Add its values directly in the Render dashboard; **never commit or upload the service-role key**.
