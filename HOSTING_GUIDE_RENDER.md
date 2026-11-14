# Complete Guide: Hosting Insaf AI WhatsApp System on Render (Free Plan)

Everything in your Supabase project (`insaf-ai-whatsapp`, region **Singapore / `ap-southeast-1`**) is **already created, migrated, and configured** — you do **not** need to run any SQL scripts or create database tables.

---

## Step 1: Upload the Project to GitHub

Render deploys Node.js apps directly from GitHub (free).

1. Create a **new Private repository** on GitHub (e.g., `insaf-ai-whatsapp-system`).
   > **Important:** Keep the repo **Private** if you ever push keys, and note that `.gitignore` already excludes `.env` and `node_modules/` so secrets are never accidentally committed.
2. Download the project folder `ai.insafboost.com full-system` from Google Drive (or extract the zip).
3. Inside that folder, push the code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial Insaf AI WhatsApp Automation system"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/insaf-ai-whatsapp-system.git
   git push -u origin main
   ```

---

## Step 2: Create the Free Web Service on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com) and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your GitHub repository (`insaf-ai-whatsapp-system`).
4. Configure the Web Service settings:
   - **Name:** `insaf-ai-whatsapp`
   - **Region:** `Singapore` (matches your Supabase database in `ap-southeast-1` for lowest latency!)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free** (`$0/month`)
   - *(Optional)* Under **Advanced → Health Check Path**, set `/health`.

---

## Step 3: Add Environment Variables on Render

Before clicking **Create Web Service** (or under **Environment** tab after creation), add these exact variables from `RENDER_ENV_VARS.txt`:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://bktvrzmecvraihdejiys.supabase.co` |
| `SUPABASE_ANON_KEY` | *(see `RENDER_ENV_VARS.txt`)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(see `RENDER_ENV_VARS.txt`)* |
| `DEFAULT_AI_PROVIDER` | `gemini` |
| `DEFAULT_AI_MODEL` | `gemini-2.5-flash` |

*(Optional)* If you also want a default fallback AI key for users who don't enter their own key in the Dashboard, add:
- `DEFAULT_AI_API_KEY` = your Gemini / OpenAI / Groq API key.

Click **Deploy Web Service** and wait ~1–2 minutes for the build to finish.

---

## Step 4: Verify Your Live Render Deployment

Once Render shows **Live** (e.g. `https://insaf-ai-whatsapp.onrender.com`):

1. Open `https://YOUR-APP.onrender.com/health` in your browser.
   - You should see:
     ```json
     { "ok": true, "service": "insaf-ai-whatsapp-automation", ... }
     ```
2. Open `https://YOUR-APP.onrender.com` — your full Insaf AI landing site loads!
3. Click **Get Started** (`/register.html`) to create your account and open `/dashboard.html`.

---

## Step 5: Keep Render Free Plan Awake 24/7 (Crucial for WhatsApp!)

Render's **Free Plan** spins down an app after **15 minutes of no incoming HTTP traffic**. When it sleeps, the WhatsApp WebSocket disconnects until the next HTTP request wakes it up.

Our system has two built-in protections:
1. **Persistent Postgres Session Storage:** Your WhatsApp login keys (`whatsapp_auth_keys`) live in **Supabase Postgres**, NOT Render's temporary disk. Even if Render restarts or redeploys, your server automatically runs `restoreSavedWhatsAppSessions()` on boot without needing a new QR scan!
2. **Keep-Alive `/health` Ping:** Set up a free monitor to ping `/health` every **5–10 minutes** so Render stays awake 24/7:
   - Go to [https://uptimerobot.com](https://uptimerobot.com) or [https://cron-job.org](https://cron-job.org) (both free).
   - Create a new **HTTP(s) Monitor**.
   - **URL:** `https://YOUR-APP.onrender.com/health`
   - **Interval:** Every **5 minutes** (or **10 minutes**).
   - Save! Your Render instance will stay online continuously and respond to WhatsApp messages instantly.

---

## Step 6: Optional Custom Domain & Supabase Auth Redirects

- Your Supabase project already allows `https://*.onrender.com/**` and `http://localhost:3000/**` in Auth Redirect URLs.
- If you connect a custom domain (e.g., `ai.yourdomain.com`) in Render **Settings → Custom Domains**, also add `https://ai.yourdomain.com/**` in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.
