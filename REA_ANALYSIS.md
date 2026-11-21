# Sales Reply AI — System Analysis & Feature Map

**Product:** Sales Reply AI — Bangladesh AI Chatbot SaaS (https://salesreplyai.codexanta.bond)
**Developed by:** Codexanta
**Date:** 2026-11-21
**Method:** Static analysis of the original web bundles (via the REA workflow — [morluto/rea](https://github.com/morluto/rea)), followed by a clean-room rebuild as Node.js + Express + Baileys + Supabase.

> This document records how the product's pages, widget API and pricing map to the code in this repository. The REA tooling itself is not bundled; `scripts/clone-agent.sh` contains the reproducible crawl used for the analysis.

---

## 1. Product overview

| Item | Detail |
|---|---|
| Product | Sales Reply AI — AI chatbot for Facebook Messenger, WhatsApp & website live chat (Bangla-first, Bangladesh market) |
| Stack (original observed) | Laravel (PHP) — `XSRF-TOKEN` + `ai-agent-saas-session` cookies, LiteSpeed, server-rendered HTML |
| This build | Node.js + Express REST API, Baileys WhatsApp client, Supabase Postgres/Auth |
| Theme | Dark default + light theme (`light.js` / `light.css`, localStorage key `sra-theme`, `window.SraTheme`, `sra:themechange` event) |
| Auth | Email/password + Google OAuth (`/auth/google/redirect`), Supabase JWT verified by `requireAuth` |
| Contact | — |

## 2. Route map

```
/                          Landing (hero, live-demo chat, features, how-it-works, reviews)
/pricing                   6 plans (see §4)
/blog                      Blog index + search (?s=)
/blog/facebook-messenger-ai-chatbot
/blog/facebook-page-auto-reply-bangla-ai-chatbot
/documentation            Facebook App setup guide (permissions, Graph Explorer, manual setup)
/login                     POST /login  (email, password, remember)
/register                  POST /register (username, email, password, password_confirmation)
/forgot-password           POST /forgot-password
/auth/google/redirect      Google OAuth entry
/privacy-policy  /terms  /data-deletion
/robots.txt  /sitemap.xml
/assets/common/css/common.css
/assets/common/css/light.css
/assets/common/js/light.js
/js/widget.js              Live-chat widget v2.2 (see §3)
```

## 3. Widget API contract (`widget.js`, 71 KB)

The widget is a Tawk.to/Crisp-style embed. It reads `data-token` from its own `<script>` tag and talks to three endpoints:

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/widget/init?token=` | GET | — | `{status:'success', config:{primaryColor,bgColor,textColor,headerBg,headerTextColor,widgetTitle,agentName,welcomeMessage,botAvatar,hideBranding,customBrandingText,prechatMode,prechatAskName,prechatAskPhone,prechatAskEmail,aiActive,replyDelayEnabled,replyDelaySeconds,allowImageUpload,allowVoiceRecord,voiceReplyEnabled}}` |
| `/api/widget/history?token=&visitor_id=` | GET | visitor UUID in `localStorage` + cookie `sra_visitor_uuid` | `{status:'success', contact:{name,phone,email}, messages:[{id,direction,content,message_type,media_url,created_at}]}` |
| `/api/widget/send` | POST multipart | `token, visitor_id, message, image(file), audio(file), duration, visitor_name, visitor_phone, visitor_email, current_url` | `{status:'success', user_msg_id, reply, reply_id, reply_delay_enabled, reply_delay_seconds, audio_url, images[], image_details[{id,url,caption}]}` |

Key semantics:

- **Direction is business-centric:** `incoming` = visitor → business, `outgoing` = bot/business → visitor (the widget inverts them for display).
- **Pre-chat modes:** `disabled | optional | required` with name/phone/email asks.
- **Reply delay:** the server may return `reply_delay_enabled/seconds`; the widget waits so the typing indicator feels human.
- **Media:** image uploads + voice notes (webm/m4a), product-image replies (`📷 Product Image:` prefix, `image_details` array).
- **Visitor identity:** `vis_<random><timestamp>` UUID, 1-year cookie.

**Implementation:** `src/widgetService.js` implements all three endpoints, backed by `widget_tokens`, `widget_conversations` and `widget_messages` tables.

## 4. Pricing

| Plan | Price (৳/30d) | Messages | Comment replies | FAQ replies | Products | Voice |
|---|---|---|---|---|---|---|
| Free Trial | 0 / 3 days | 30 | 10 | 10 | 5 | STT |
| Basic | 799 | 1,000 | 100 | 100 | 50 | STT |
| Advance ⭐ | 1,799 | 2,500 | 500 | 200 | 70 | STT |
| Business | 4,499 | 6,500 | 1,000 | 500 | 70 | STT |
| Pro | 9,999 | 15,000 | 2,000 | 1,000 | 200 | STT+TTS |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Unlimited | Both |

All plans include Facebook Messenger, WhatsApp Bot and Website Live Chat Widget.
**Implementation:** `src/plans.js` + quota enforcement in every AI reply path.

## 5. Feature → implementation map

| Feature | Location |
|---|---|
| Landing / pricing / blog / docs / legal pages | `public/*.html` (clean-URL routes in `src/server.js`) |
| Light/dark theme engine | `public/assets/js/light.js` + `light.css` |
| Live-chat widget | `public/js/widget.js` + `src/widgetService.js` |
| WhatsApp QR connect (Baileys) | `src/whatsappManager.js` + `src/supabaseAuthState.js` (Postgres-persisted creds) |
| Multi-provider AI (Gemini/OpenAI/Groq/OpenRouter/Claude) | `src/aiService.js` |
| Product catalog → AI knowledge | `ai_products` table + prompt injection in `aiService.js` |
| Facebook Messenger bot | `src/facebookManager.js` (`/webhook/facebook`, Graph API v21.0) |
| Orders + courier tracking | `orders` table + `/api/orders` |
| Analytics dashboard | `/api/dashboard/stats` + dashboard cards |
| Auth (email/password + Google) | Supabase Auth (`auth-app.js` + `/api/public-config`) |
| Plan quotas | `src/plans.js` (`checkMessageQuota`) |

## 6. Fixed from the earlier partial build

1. Widget backend missing → `widgetService.js`
2. No Facebook webhook → `facebookManager.js`
3. No orders API → `/api/orders`
4. No analytics endpoint → `/api/dashboard/stats`
5. No `schema.sql` → `supabase/schema.sql`
6. No plan/quota logic → `src/plans.js`
7. Dashboard had no Widget/Facebook/Orders UI → new dashboard sections
8. Frontend was stale → refreshed from a full crawl

## 7. Re-running the analysis

```bash
git clone https://github.com/morluto/rea.git
cd rea
npx rea-agents setup        # registers the REA MCP server with your agent
# Then ask your agent, e.g.:
# "Use REA to statically analyse https://salesreplyai.codexanta.bond/js/widget.js
#  and list every API endpoint, request field and response shape."
```

Or re-crawl the site with the bundled script:

```bash
bash scripts/clone-agent.sh   # downloads all pages + JS/CSS into clone-output/
```
