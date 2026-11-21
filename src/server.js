import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
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
import { PLANS, getPlan, checkMessageQuota } from './plans.js';
import {
  DEFAULT_WIDGET_CONFIG,
  generateWidgetToken,
  handleWidgetHistory,
  handleWidgetInit,
  handleWidgetSend
} from './widgetService.js';
import { handleFacebookWebhook, verifyWebhook } from './facebookManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());

// Keep raw body for Meta webhook signature verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Health / Keep-Alive endpoint for Render Free Plan & UptimeRobot / cron-job.org
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sales-reply-ai-full-system-v2',
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

// Public plan catalog (pricing page + dashboard)
app.get('/api/plans', (req, res) => {
  res.json({ plans: Object.values(PLANS) });
});

// ---------------------------------------------------------------------------
// Website Live-Chat Widget (public, token-authenticated) — see widgetService.js
// ---------------------------------------------------------------------------
app.get('/api/widget/init', handleWidgetInit);
app.get('/api/widget/history', handleWidgetHistory);
app.post('/api/widget/send', upload.fields([{ name: 'image' }, { name: 'audio' }]), handleWidgetSend);

// Widget token management (dashboard, JWT-authenticated)
app.get('/api/widget/tokens', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('widget_tokens')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ tokens: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/widget/tokens', requireAuth, async (req, res) => {
  try {
    const label = String(req.body?.label || 'Default Widget').trim();
    const config = { ...DEFAULT_WIDGET_CONFIG, ...(req.body?.config || {}) };
    const { data, error } = await supabaseAdmin
      .from('widget_tokens')
      .insert({ user_id: req.user.id, token: generateWidgetToken(), label, config })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ token: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/widget/tokens/:id', requireAuth, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.label === 'string') patch.label = req.body.label.trim();
    if (typeof req.body?.is_active === 'boolean') patch.is_active = req.body.is_active;
    if (req.body?.config && typeof req.body.config === 'object') patch.config = req.body.config;
    const { data, error } = await supabaseAdmin
      .from('widget_tokens')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ token: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/widget/tokens/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('widget_tokens')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Widget inbox (dashboard view of website conversations)
app.get('/api/widget/conversations', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const { data, error } = await supabaseAdmin
      .from('widget_conversations')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ conversations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/widget/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('widget_messages')
      .select('*')
      .eq('conversation_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Facebook Messenger webhook (Meta calls this; no JWT)
// ---------------------------------------------------------------------------
app.get('/webhook/facebook', verifyWebhook);
app.post('/webhook/facebook', handleFacebookWebhook);

// Facebook page management (dashboard)
app.get('/api/facebook/pages', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('facebook_pages')
      .select('id, page_id, page_name, is_active, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ pages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/facebook/pages', requireAuth, async (req, res) => {
  try {
    const { page_id, page_name, page_access_token } = req.body || {};
    if (!page_id) return res.status(400).json({ error: 'page_id is required' });
    const { data, error } = await supabaseAdmin
      .from('facebook_pages')
      .upsert(
        {
          user_id: req.user.id,
          page_id: String(page_id).trim(),
          page_name: String(page_name || '').trim(),
          page_access_token: page_access_token ? String(page_access_token).trim() : null,
          is_active: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'page_id' }
      )
      .select('id, page_id, page_name, is_active')
      .single();
    if (error) throw error;
    res.status(201).json({ page: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/facebook/pages/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('facebook_pages')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      max_history,
      plan_id
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
    if (plan_id && PLANS[plan_id]) payload.plan_id = plan_id;

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
        user_id: req.user.id,
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

// --- Orders ---
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_address, items, total_amount, channel, notes } = req.body || {};
    if (!customer_phone) return res.status(400).json({ error: 'customer_phone is required' });
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: req.user.id,
        customer_name: String(customer_name || '').trim(),
        customer_phone: String(customer_phone).trim(),
        customer_address: String(customer_address || '').trim(),
        items: Array.isArray(items) ? items : [],
        total_amount: String(total_amount || '').trim(),
        channel: String(channel || 'whatsapp').trim(),
        notes: String(notes || '').trim()
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ order: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const allowed = ['status', 'courier_tracking_id', 'notes', 'customer_name', 'customer_phone', 'customer_address', 'total_amount'];
    const patch = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (typeof req.body?.[key] === 'string') patch[key] = req.body[key].trim();
    }
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ order: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WhatsApp + Facebook Message Logs ---
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

// --- Dashboard Analytics ---
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: settings }, waCount, wgCount, ordersCount, productsCount] = await Promise.all([
      supabaseAdmin.from('ai_settings').select('plan_id').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
      supabaseAdmin.from('widget_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
      supabaseAdmin.from('ai_products').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    const plan = getPlan(settings?.plan_id || 'free_trial');
    const quota = await checkMessageQuota(supabaseAdmin, userId, settings?.plan_id || 'free_trial');
    res.json({
      plan,
      messages_30d: (waCount.count || 0) + (wgCount.count || 0),
      whatsapp_messages_30d: waCount.count || 0,
      widget_messages_30d: wgCount.count || 0,
      orders_30d: ordersCount.count || 0,
      products: productsCount.count || 0,
      quota_used: quota.used,
      quota_limit: Number.isFinite(quota.limit) ? quota.limit : null,
      quota_remaining: Number.isFinite(quota.limit) ? Math.max(quota.limit - quota.used, 0) : null
    });
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

// Compatibility aliases for the crawled site's original asset URL layout.
// Keep these local so Render serves the bundled assets without relying on the source host.
app.use('/assets/common/css', express.static(path.join(PUBLIC_DIR, 'assets/css')));
app.use('/assets/common/js', express.static(path.join(PUBLIC_DIR, 'assets/js')));
app.use('/uploads/upload/logos', express.static(path.join(PUBLIC_DIR, 'assets/images')));
app.use('/uploads/blogs', express.static(path.join(PUBLIC_DIR, 'assets/images')));
app.use(express.static(PUBLIC_DIR));

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ status: 'error', message: 'File too large (max 10MB)' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

function maskKey(key) {
  const s = String(key).trim();
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sales Reply AI Server v2] Running on http://0.0.0.0:${PORT}`);
  restoreSavedWhatsAppSessions();
});
