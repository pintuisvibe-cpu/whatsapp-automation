import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, supabaseAdmin } from './supabase.js';
import {
  disconnectWhatsAppSession,
  getActiveSessionCount,
  getWhatsAppStatus,
  restoreSavedWhatsAppSessions,
  startWhatsAppSession
} from './whatsappManager.js';
import { generateAIReply, PROVIDER_DEFAULTS } from './aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health / Keep-Alive endpoint for Render Free Plan & UptimeRobot / cron-job.org
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'insaf-ai-whatsapp-saas',
    uptime_seconds: Math.floor(process.uptime()),
    active_whatsapp_sessions: getActiveSessionCount(),
    timestamp: new Date().toISOString()
  });
});

// Safe public Supabase configuration for browser auth
app.get('/api/public-config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// --- WhatsApp QR & Session Routes ---
app.get('/api/whatsapp/status', requireAuth, async (req, res) => {
  try {
    const status = await getWhatsAppStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/connect', requireAuth, async (req, res) => {
  try {
    const resetAuth = Boolean(req.body?.resetAuth);
    const status = await startWhatsAppSession(req.user.id, { resetAuth });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/disconnect', requireAuth, async (req, res) => {
  try {
    const status = await disconnectWhatsAppSession(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI Settings Routes ---
app.get('/api/ai/settings', requireAuth, async (req, res) => {
  try {
    let { data, error } = await supabaseAdmin
      .from('ai_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const inserted = await supabaseAdmin
        .from('ai_settings')
        .insert({ user_id: req.user.id })
        .select('*')
        .single();
      data = inserted.data;
    }

    res.json({
      ...data,
      has_api_key: Boolean(data?.api_key && data.api_key.trim()),
      api_key_masked: data?.api_key ? maskKey(data.api_key) : '',
      provider_defaults: PROVIDER_DEFAULTS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ai/settings', requireAuth, async (req, res) => {
  try {
    const {
      enabled,
      provider,
      model,
      api_key,
      system_prompt,
      business_knowledge,
      reply_delay_ms,
      ignore_groups,
      max_history
    } = req.body || {};

    const { data: existing } = await supabaseAdmin
      .from('ai_settings')
      .select('api_key')
      .eq('user_id', req.user.id)
      .maybeSingle();

    // Only overwrite api_key if user sent a non-masked new value (or explicitly cleared it with clear_api_key)
    let nextApiKey = existing?.api_key || '';
    if (req.body?.clear_api_key === true) {
      nextApiKey = '';
    } else if (typeof api_key === 'string' && api_key.trim() && !api_key.includes('••••')) {
      nextApiKey = api_key.trim();
    }

    const payload = {
      user_id: req.user.id,
      enabled: Boolean(enabled),
      provider: (provider || 'gemini').toLowerCase(),
      model: (model || PROVIDER_DEFAULTS[provider] || 'gemini-2.5-flash').trim(),
      api_key: nextApiKey,
      system_prompt: typeof system_prompt === 'string' ? system_prompt : '',
      business_knowledge: typeof business_knowledge === 'string' ? business_knowledge : '',
      reply_delay_ms: Math.min(Math.max(Number(reply_delay_ms) || 1500, 0), 10000),
      ignore_groups: ignore_groups !== false,
      max_history: Math.min(Math.max(Number(max_history) || 10, 1), 30),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('ai_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw error;

    res.json({
      ...data,
      has_api_key: Boolean(data?.api_key && data.api_key.trim()),
      api_key_masked: data?.api_key ? maskKey(data.api_key) : ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test AI reply directly in Dashboard
app.post('/api/ai/test', requireAuth, async (req, res) => {
  try {
    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message text is required' });

    const [{ data: settings }, { data: products }] = await Promise.all([
      supabaseAdmin.from('ai_settings').select('*').eq('user_id', req.user.id).maybeSingle(),
      supabaseAdmin.from('ai_products').select('*').eq('user_id', req.user.id)
    ]);

    if (!settings) return res.status(400).json({ error: 'Save AI settings first.' });

    const result = await generateAIReply({
      settings,
      products: products || [],
      history: [],
      incomingText: message
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Product Catalog Routes ---
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_products')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ products: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { name, price, stock_status, description } = req.body || {};
    if (!name || !price) {
      return res.status(400).json({ error: 'Product name and price are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('ai_products')
      .insert({
        user_id: userIdFromReq(req),
        name: String(name).trim(),
        price: String(price).trim(),
        stock_status: String(stock_status || 'In Stock').trim(),
        description: String(description || '').trim()
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ product: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('ai_products')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WhatsApp Message Logs ---
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clean URL routes for static HTML pages (supports both /login and /login.html)
const cleanPageRoutes = [
  ['/', 'index.html'],
  ['/pricing', 'pricing.html'],
  ['/blog', 'blog.html'],
  ['/blog/facebook-messenger-ai-chatbot', 'blog/facebook-messenger-ai-chatbot.html'],
  ['/blog/facebook-page-auto-reply-bangla-ai-chatbot', 'blog/facebook-page-auto-reply-bangla-ai-chatbot.html'],
  ['/documentation', 'documentation.html'],
  ['/login', 'login.html'],
  ['/register', 'register.html'],
  ['/forgot-password', 'forgot-password.html'],
  ['/dashboard', 'dashboard.html'],
  ['/privacy-policy', 'privacy-policy.html'],
  ['/terms', 'terms.html'],
  ['/data-deletion', 'data-deletion.html']
];

for (const [routePath, fileRel] of cleanPageRoutes) {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, fileRel));
  });
}

app.use(express.static(PUBLIC_DIR));

function maskKey(key) {
  const s = String(key).trim();
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

function userIdFromReq(req) {
  return req.user.id;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Insaf AI Server] Running on http://0.0.0.0:${PORT}`);
  restoreSavedWhatsAppSessions();
});
