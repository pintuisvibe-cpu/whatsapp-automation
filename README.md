# Insaf AI — Full-Stack WhatsApp QR & Multi-Provider AI Auto-Reply System

A complete Node.js + Express + Baileys + Supabase full-stack SaaS combining the **Insaf AI (`ai.insafboost.com`)** frontend website with real **Supabase Authentication**, **WhatsApp Web QR-code connection**, **multi-provider AI auto-replies**, **product catalog knowledge injection**, and **Render Free Plan persistence**.

---

## Key Features

- **Full Website + Auth:** All 12 Insaf AI pages (`index.html`, `pricing.html`, `blog.html`, `documentation.html`, `login.html`, `register.html`, `forgot-password.html`, legal pages) wired to live **Supabase Auth**.
- **WhatsApp QR Connect (`@whiskeysockets/baileys`):** Multi-user WhatsApp session manager generating crisp PNG QR codes in the browser — no Meta Cloud API business verification required.
- **Render Free Plan Persistent Sessions:** Custom `useSupabaseAuthState` stores Baileys `creds` and Signal `keys` inside Supabase Postgres (`public.whatsapp_auth_keys`) instead of ephemeral disk, automatically restoring active WhatsApp connections on server boot.
- **Multi-Provider AI Engine:** Switch anytime in the Dashboard UI between:
  - **Google Gemini** (`gemini-2.5-flash`, `gemini-2.5-pro`)
  - **OpenAI** (`gpt-4o-mini`, `gpt-4o`)
  - **Groq** (`llama-3.3-70b-versatile`)
  - **OpenRouter** (any model)
  - **Anthropic Claude** (`claude-3-5-haiku-latest`, `claude-sonnet-4-20250514`)
- **Product Catalog & Business Knowledge:** Per-user product database (`ai_products`) and delivery/policy notes automatically injected into AI prompts, plus per-customer conversation history (`whatsapp_messages`).
- **Keep-Alive Ready:** Lightweight `/health` endpoint returning session counts and uptime for UptimeRobot / Cron-Job pings.

---

## Project Structure

```text
ai.insafboost.com full-system/
├── package.json
├── render.yaml                   # Render Free Plan blueprint
├── RENDER_ENV_VARS.txt           # Ready-to-paste Render environment variables
├── HOSTING_GUIDE_RENDER.md       # Step-by-step Render free hosting guide
├── USAGE_GUIDE.md                # Step-by-step WhatsApp QR & AI usage guide
├── .env.example
├── src/
│   ├── server.js                 # Express API + static frontend + boot session restore
│   ├── supabase.js               # Supabase admin client & JWT auth middleware
│   ├── supabaseAuthState.js      # Baileys Postgres auth-state adapter
│   ├── whatsappManager.js        # Baileys QR, auto-reconnect, incoming AI reply handler
│   └── aiService.js              # Gemini / OpenAI / Groq / OpenRouter / Claude client
└── public/
    ├── index.html, login.html, register.html, dashboard.html, ...
    ├── blog/
    └── assets/
        ├── css/, fonts/, images/
        └── js/ (supabase.min.js, auth-app.js, dashboard.js, light.js, widget.js)
```

---

## Quick Local Run

```bash
npm install
npm start
# Open http://localhost:3000
```

See **`HOSTING_GUIDE_RENDER.md`** for Render deployment and **`USAGE_GUIDE.md`** for connecting WhatsApp & AI.
