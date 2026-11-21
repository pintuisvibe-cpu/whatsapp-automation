# User Guide: Connecting WhatsApp QR & Enabling AI Auto-Reply

Follow these steps after opening your live website (locally at `http://localhost:3000` or on Render at `https://YOUR-APP.onrender.com`).

---

## 1. Create Your Account & Open the Dashboard

1. Open `/register.html` (click **Get Started** on the homepage).
2. Enter a **Username**, **Email**, and **Password** (minimum 6 characters), then click **Create Account**.
   - Email auto-confirm is already enabled in Supabase, so you are logged in and redirected straight to `/dashboard.html`.
3. Next time, just click **Log In** (`/login.html`).

---

## 2. Get a Free AI API Key (Recommended: Google Gemini)

You can use **Google Gemini**, **OpenAI**, **Groq**, **OpenRouter**, or **Anthropic Claude** right from the Dashboard UI.

To get a **free Google Gemini API key** in 30 seconds:
1. Visit [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with your Google account and click **Create API key**.
3. Copy the key (`AIza...`).

*(Alternative free option: [Groq Console](https://console.groq.com/keys) offers super-fast free Llama 3.3 inference!)*

---

## 3. Configure AI Auto-Reply in the Dashboard

In the **Multi-Provider AI Auto-Reply Settings** card on `/dashboard.html`:
1. Ensure **Enable WhatsApp AI Auto-Reply** is checked (`ON`).
2. Select **AI Provider** (e.g., `Google Gemini`) and pick a model chip (e.g., `gemini-2.5-flash`).
3. Paste your **API Key**.
4. Customize **System Prompt** (tells the AI its persona, language—Bangla/Banglish/English—and tone).
5. Fill in **Business Knowledge / Delivery & Payment Info** (e.g., delivery fee inside/outside Dhaka, bKash/Nagad number, return policy, showroom address).
6. Click **Save AI Settings**.

### Add Your Products
In the **Product Catalog (AI Knowledge)** card:
- Add your products with **Name**, **Price**, **Stock Status**, and **Short Details**.
- Every saved product is automatically injected into the AI's context whenever a WhatsApp customer asks *"দাম কত?"* or *"What products do you have?"*.

### Test Before Going Live
Use the **🧪 Test AI Reply (Preview)** box:
- Type a customer question like `ভাই ডেলিভারি চার্জ কত আর কোন কোন প্রোডাক্ট আছে?` and click **Test** to verify the AI's response immediately.

---

## 4. Connect Your WhatsApp via QR Scan

In the **📱 WhatsApp Connection** card:
1. Click **Connect / Generate QR**.
2. Wait 2–4 seconds for the QR code image to appear.
3. On your phone:
   - Open **WhatsApp**.
   - Tap **⋮ (Android)** or **Settings (iPhone)** → **Linked Devices**.
   - Tap **Link a Device** and scan the QR code on screen.
4. Within a few seconds, the badge turns **Connected ✅** and displays your WhatsApp number!

> **Note:** Your WhatsApp session credentials are saved encrypted/JSON-encoded in your Supabase Postgres database (`whatsapp_auth_keys`). If your server restarts, it reconnects automatically without asking for the QR code again.

---

## 5. Watch Live Incoming Messages & AI Replies

- Ask a friend (or message from a second WhatsApp number) to send a message to your connected WhatsApp number.
- Note: WhatsApp does **not** trigger auto-reply for messages you send to *yourself* from the same account (`fromMe` messages are ignored to prevent infinite loops).
- In **💬 Live WhatsApp Message Logs**, you will see:
  - The incoming customer message (`👤`)
  - The outgoing AI reply (`🤖 Sales Reply AI`) along with the model used!

---

## Troubleshooting

- **QR Code Expired / Not Scanning:** Click **Fresh QR** to wipe stale keys and generate a brand-new QR code.
- **WhatsApp Shows "Logged Out":** If you unlinked the device from your phone's *Linked Devices* menu, click **Fresh QR** in the Dashboard and scan again.
- **AI Not Replying:**
  1. Confirm **Enable WhatsApp AI Auto-Reply** is checked and **Save AI Settings** was clicked.
  2. Verify your API key works using the **Test AI Reply** box.
  3. Confirm you are testing from a **different** WhatsApp number (and not in a group chat if *Ignore WhatsApp Group Messages* is ON).
