/**
 * Sales Reply AI — Website Live-Chat Widget Backend
 * Implements the exact contract expected by public/js/widget.js (v2.2):
 *   GET  /api/widget/init?token=XXX
 *   GET  /api/widget/history?token=XXX&visitor_id=YYY
 *   POST /api/widget/send   (multipart/form-data)
 *
 * Message direction semantics (matching widget.js renderSingleMessage):
 *   'incoming' = visitor -> business  (rendered as outgoing bubble)
 *   'outgoing' = business/bot -> visitor (rendered as incoming bubble)
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase.js';
import { generateAIReply } from './aiService.js';
import { checkMessageQuota } from './plans.js';

export const DEFAULT_WIDGET_CONFIG = {
  primaryColor: '#8B5CF6',
  bgColor: '#0F172A',
  textColor: '#FFFFFF',
  headerBg: '#8B5CF6',
  headerTextColor: '#FFFFFF',
  widgetTitle: 'Customer Support',
  agentName: 'Support Agent',
  welcomeMessage: 'Hello! How can we help you today?',
  botAvatar: null,
  hideBranding: false,
  customBrandingText: null,
  prechatMode: 'disabled', // disabled | optional | required
  prechatAskName: true,
  prechatAskPhone: true,
  prechatAskEmail: false,
  aiActive: true,
  replyDelayEnabled: false,
  replyDelaySeconds: 3,
  allowImageUpload: true,
  allowVoiceRecord: true,
  voiceReplyEnabled: false
};

export function generateWidgetToken() {
  return 'wgt_' + crypto.randomBytes(24).toString('hex');
}

/** Resolve a widget token to its owner + config row. Returns null when invalid/inactive. */
export async function resolveWidgetToken(token) {
  if (!token || typeof token !== 'string') return null;
  const { data, error } = await supabaseAdmin
    .from('widget_tokens')
    .select('*')
    .eq('token', token.trim())
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function toClientConfig(row) {
  const cfg = { ...DEFAULT_WIDGET_CONFIG, ...(row?.config || {}) };
  // Coerce booleans/numbers that may arrive as strings from JSONB
  for (const k of ['hideBranding', 'prechatAskName', 'prechatAskPhone', 'prechatAskEmail', 'aiActive', 'replyDelayEnabled', 'allowImageUpload', 'allowVoiceRecord', 'voiceReplyEnabled']) {
    if (typeof cfg[k] === 'string') cfg[k] = cfg[k] === 'true';
  }
  cfg.replyDelaySeconds = Number(cfg.replyDelaySeconds) || 3;
  return cfg;
}

async function getOrCreateConversation(userId, visitorId, visitorMeta = {}) {
  const { data: existing } = await supabaseAdmin
    .from('widget_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('visitor_id', visitorId)
    .maybeSingle();
  if (existing) {
    // Keep contact info fresh
    const patch = {};
    if (visitorMeta.name) patch.visitor_name = visitorMeta.name;
    if (visitorMeta.phone) patch.visitor_phone = visitorMeta.phone;
    if (visitorMeta.email) patch.visitor_email = visitorMeta.email;
    if (visitorMeta.current_url) patch.last_page_url = visitorMeta.current_url;
    patch.updated_at = new Date().toISOString();
    const { data: updated } = await supabaseAdmin
      .from('widget_conversations')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();
    return updated || existing;
  }
  const { data: created, error } = await supabaseAdmin
    .from('widget_conversations')
    .insert({
      user_id: userId,
      visitor_id: visitorId,
      visitor_name: visitorMeta.name || '',
      visitor_phone: visitorMeta.phone || '',
      visitor_email: visitorMeta.email || '',
      last_page_url: visitorMeta.current_url || ''
    })
    .select('*')
    .single();
  if (error) throw error;
  return created;
}

/** GET /api/widget/init */
export async function handleWidgetInit(req, res) {
  try {
    const row = await resolveWidgetToken(req.query.token);
    if (!row) {
      return res.status(404).json({ status: 'error', message: 'Inactive or unauthorized widget token' });
    }
    res.json({ status: 'success', config: toClientConfig(row) });
  } catch (err) {
    console.error('[Widget] init error:', err.message);
    res.status(500).json({ status: 'error', message: 'Widget init failed' });
  }
}

/** GET /api/widget/history */
export async function handleWidgetHistory(req, res) {
  try {
    const row = await resolveWidgetToken(req.query.token);
    if (!row) {
      return res.status(404).json({ status: 'error', message: 'Inactive or unauthorized widget token', messages: [] });
    }
    const visitorId = String(req.query.visitor_id || '').trim();
    if (!visitorId) {
      return res.json({ status: 'success', contact: {}, messages: [] });
    }
    const conv = await getOrCreateConversation(row.user_id, visitorId);
    const { data: messages } = await supabaseAdmin
      .from('widget_messages')
      .select('id, direction, content, message_type, media_url, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(100);
    res.json({
      status: 'success',
      contact: {
        name: conv.visitor_name || '',
        phone: conv.visitor_phone || '',
        email: conv.visitor_email || ''
      },
      messages: messages || []
    });
  } catch (err) {
    console.error('[Widget] history error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to load history', messages: [] });
  }
}

/**
 * POST /api/widget/send  (multipart)
 * Fields: token, visitor_id, message, image(file), audio(file), duration,
 *         visitor_name, visitor_phone, visitor_email, current_url
 * Response: { status, user_msg_id, reply, reply_id, reply_delay_enabled,
 *             reply_delay_seconds, audio_url, images, image_details }
 */
export async function handleWidgetSend(req, res) {
  try {
    const body = req.body || {};
    const files = req.files || {};
    const token = body.token;
    const visitorId = String(body.visitor_id || '').trim();
    const text = String(body.message || '').trim();

    const row = await resolveWidgetToken(token);
    if (!row) {
      return res.status(404).json({ status: 'error', message: 'Inactive or unauthorized widget token' });
    }
    if (!visitorId) {
      return res.status(400).json({ status: 'error', message: 'visitor_id is required' });
    }

    const config = toClientConfig(row);
    const conv = await getOrCreateConversation(row.user_id, visitorId, {
      name: body.visitor_name,
      phone: body.visitor_phone,
      email: body.visitor_email,
      current_url: body.current_url
    });

    // Save visitor message(s). Media files are stored as data-URLs in dev
    // (swap for Supabase Storage URLs in production — see README).
    const savedIds = [];
    const imageFile = files.image;
    const audioFile = files.audio;

    if (text) {
      const { data } = await supabaseAdmin
        .from('widget_messages')
        .insert({
          conversation_id: conv.id,
          user_id: row.user_id,
          direction: 'incoming',
          content: text,
          message_type: 'text'
        })
        .select('id')
        .single();
      if (data?.id) savedIds.push(data.id);
    }
    if (imageFile) {
      const dataUrl = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`;
      const { data } = await supabaseAdmin
        .from('widget_messages')
        .insert({
          conversation_id: conv.id,
          user_id: row.user_id,
          direction: 'incoming',
          content: '[Image]',
          message_type: 'image',
          media_url: dataUrl
        })
        .select('id')
        .single();
      if (data?.id) savedIds.push(data.id);
    }
    if (audioFile) {
      const dataUrl = `data:${audioFile.mimetype};base64,${audioFile.buffer.toString('base64')}`;
      const { data } = await supabaseAdmin
        .from('widget_messages')
        .insert({
          conversation_id: conv.id,
          user_id: row.user_id,
          direction: 'incoming',
          content: `[Voice Note ${body.duration || ''}s]`,
          message_type: 'audio',
          media_url: dataUrl
        })
        .select('id')
        .single();
      if (data?.id) savedIds.push(data.id);
    }

    const userMsgId = savedIds[0] || null;
    const baseResponse = {
      status: 'success',
      user_msg_id: userMsgId,
      reply: '',
      reply_id: null,
      reply_delay_enabled: Boolean(config.replyDelayEnabled),
      reply_delay_seconds: Number(config.replyDelaySeconds) || 0,
      audio_url: null,
      images: [],
      image_details: []
    };

    // AI auto-reply (only for text; media-only messages get a friendly ack)
    if (!config.aiActive) return res.json(baseResponse);

    const { data: settings } = await supabaseAdmin
      .from('ai_settings')
      .select('*')
      .eq('user_id', row.user_id)
      .maybeSingle();
    if (!settings?.enabled) return res.json(baseResponse);

    const quota = await checkMessageQuota(supabaseAdmin, row.user_id, settings.plan_id || 'free_trial');
    if (!quota.allowed) {
      baseResponse.reply = 'আমাদের AI মেসেজ লিমিট শেষ হয়ে গেছে। শীঘ্রই আবার চেষ্টা করুন অথবা আমাদের হটলাইনে কল করুন।';
      return res.json(baseResponse);
    }

    const [{ data: products }, { data: history }] = await Promise.all([
      supabaseAdmin.from('ai_products').select('*').eq('user_id', row.user_id),
      supabaseAdmin
        .from('widget_messages')
        .select('direction, content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(Number(settings.max_history) || 10)
    ]);

    const incomingText = text || (imageFile ? 'Customer sent a product image.' : 'Customer sent a voice note.');
    let replyText;
    try {
      const result = await generateAIReply({
        settings,
        products: products || [],
        history: (history || []).reverse().map((m) => ({
          direction: m.direction === 'incoming' ? 'incoming' : 'outgoing',
          message_text: m.content
        })),
        incomingText
      });
      replyText = typeof result === 'string' ? result : result.reply || result.text || '';
    } catch (aiErr) {
      console.error('[Widget] AI reply failed:', aiErr.message);
      replyText = 'ধন্যবাদ! আপনার মেসেজটি পেয়েছি। আমাদের টিম শীঘ্রই রিপ্লাই দেবে।';
    }

    const { data: replyRow } = await supabaseAdmin
      .from('widget_messages')
      .insert({
        conversation_id: conv.id,
        user_id: row.user_id,
        direction: 'outgoing',
        content: replyText,
        message_type: 'text'
      })
      .select('id')
      .single();

    baseResponse.reply = replyText;
    baseResponse.reply_id = replyRow?.id || null;
    res.json(baseResponse);
  } catch (err) {
    console.error('[Widget] send error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to send message' });
  }
}
