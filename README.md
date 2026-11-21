# Sales Reply AI — Full System v2

**Sales Reply AI** is a Bangla-first AI chatbot SaaS for Facebook Messenger, WhatsApp and website live chat. It answers customer questions, quotes products from your catalog, takes orders and hands conversations to a human when needed.

- **Live site:** https://salesreplyai.codexanta.bond
- **Stack:** Node.js + Express + Baileys + Supabase (Postgres/Auth)
- **Developed by:** Codexanta

---

## What's included

| Area | Implementation |
|---|---|
| **Frontend (13 pages)** | Landing, Pricing, Blog (+2 posts), Documentation, Login, Register, Forgot Password, Privacy, Terms, Data Deletion, Dashboard — responsive pages with clean URLs (`/pricing`, `/blog`, …) |
| **Theme engine** | Dark + light mode (`sra-theme` localStorage key, `light.js` / `light.css`) |
| **Auth** | Supabase Auth (email/password + Google OAuth), JWT-verified API (`requireAuth`) |
| **WhatsApp** | Baileys QR connect, auto-reconnect, Postgres-persisted session creds (survives Render free-plan restarts) |
| **Website Widget** | Full backend for `widget.js` v2.2: `/api/widget/init`, `/history`, `/send` (text + image + voice, pre-chat, reply delay) |
| **Facebook Messenger** | `/webhook/facebook` (verify + signature check) + Graph API auto-replies |
| **AI Engine** | Gemini / OpenAI / Groq / OpenRouter / Claude — product catalog + business knowledge injected into prompts |
| **Orders** | CRUD + status pipeline (pending → delivered) + courier tracking ID |
| **Plans & Quotas** | 6 plans (Free Trial → Enterprise) with per-period message limits |
| **Analytics** | `/api/dashboard/stats` (30-day volume, orders, quota remaining) |
| **Database** | `supabase/schema.sql` — 11 tables + RLS + auto free-trial on signup |

## Quick start

```bash
npm install
cp .env.example .env   # fill in Supabase keys
# The connected insaf-ai-whatsapp Supabase project is already active and its required tables/migrations are present.
# For a different, brand-new Supabase project only: run supabase/schema.sql once.
# Enable the Auth providers you intend to use in Supabase Dashboard.
npm start
# Open http://localhost:3000
```

## Deploy (Render free plan)

1. Push this folder to GitHub.
2. Render → New Web Service → connect repo (uses `render.yaml`).
3. Add the real Supabase values from your local `RENDER_ENV_VARS.txt` to Render's Environment page. That file is intentionally ignored by Git because it contains the service-role secret; never upload or commit it. Facebook app/page credentials must come from Meta and are not included.
4. Keep-alive: point UptimeRobot/cron-job.org at `/health` every 5 min.
5. Point the `salesreplyai.codexanta.bond` DNS at the Render service and add it as a custom domain.

Detailed steps: [HOSTING_GUIDE_RENDER.md](./HOSTING_GUIDE_RENDER.md)

## Dashboard guide

1. **Register** → log in → Dashboard.
2. **WhatsApp card** → Connect / Generate QR → scan with WhatsApp.
3. **AI Settings** → pick provider + model, paste API key, write system prompt (Bangla tone, delivery charges, hotline…), Save.
4. **Product Catalog** → add products with price/stock — the AI quotes them automatically.
5. **Test AI Reply** → preview answers before going live.
6. **Website Widget** → Create token → copy embed snippet onto your site:
   ```html
   <script src="https://salesreplyai.codexanta.bond/js/widget.js" data-token="wgt_..."></script>
   ```
7. **Facebook** → follow the Documentation page to create a Meta App, set the webhook URL to `https://salesreplyai.codexanta.bond/webhook/facebook` with verify token `FACEBOOK_VERIFY_TOKEN`, subscribe to `messages`, then connect your Page ID in the dashboard.
8. **Orders** → AI-created orders appear here; update status as you ship.

More detail: [USAGE_GUIDE.md](./USAGE_GUIDE.md)

## Project structure

```text
sales-reply-ai/
├── package.json / render.yaml / .env.example
├── REA_ANALYSIS.md            # system analysis & feature map
├── supabase/schema.sql        # complete database schema
├── scripts/clone-agent.sh     # reproducible site crawl
├── src/
│   ├── server.js              # Express API + clean-URL pages + static
│   ├── supabase.js            # admin client + JWT middleware
│   ├── supabaseAuthState.js   # Baileys creds in Postgres
│   ├── whatsappManager.js     # WhatsApp QR + auto-reply
│   ├── aiService.js           # multi-provider AI engine
│   ├── widgetService.js       # website widget backend (init/history/send)
│   ├── facebookManager.js     # Messenger webhook + Graph API
│   └── plans.js               # 6 plans + quota checks
└── public/                    # 13-page frontend + assets
```

## Notes

- Media uploads in the widget are stored as data-URLs for simplicity; swap in Supabase Storage URLs for production (see `widgetService.js`).
- The `channel` column on `whatsapp_messages` distinguishes WhatsApp vs Facebook logs in one table.
- Never commit a real `.env` — only `.env.example` is included.
- The footer credit on every page reads: `© 2026 Sales Reply AI — Developed by Codexanta. All rights reserved.`

---

Developed by **Codexanta** · https://salesreplyai.codexanta.bond
