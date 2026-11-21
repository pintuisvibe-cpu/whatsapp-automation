/**
 * Sales Reply AI — Facebook Messenger Manager
 * Webhook verification + incoming message handling + AI auto-reply via
 * the Meta Graph API. Setup guide: /documentation (Facebook App setup).
 *
 * Env:
 *   FACEBOOK_VERIFY_TOKEN      — any secret string you set in the Meta App webhook config
 *   FACEBOOK_APP_SECRET        — used to verify X-Hub-Signature-256 (optional but recommended)
 *   FACEBOOK_PAGE_ACCESS_TOKEN — Page access token (per-page tokens can also be stored
 *                                in the facebook_pages table and take precedence)
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase.js';
import { generateAIReply } from './aiService.js';
import { checkMessageQuota } from './plans.js';

const GRAPH_VERSION = 'v21.0';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.FACEBOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

function verifySignature(req) {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) return true; // skip when not configured
  const signature = req.headers['x-hub-signature-256'] || '';
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Find the SaaS user who owns a given Facebook Page ID. */
async function findPageOwner(pageId) {
  const { data } = await supabaseAdmin
    .from('facebook_pages')
    .select('*')
    .eq('page_id', pageId)
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

async function sendMessengerText(pageAccessToken, recipientId, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageAccessToken}`
    },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text: String(text).slice(0, 2000) }
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function handleIncomingMessage(pageRow, senderId, text) {
  const userId = pageRow.user_id;
  const { data: settings } = await supabaseAdmin
    .from('ai_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!settings?.enabled) return;

  const quota = await checkMessageQuota(supabaseAdmin, userId, settings.plan_id || 'free_trial');
  if (!quota.allowed) return;

  const [{ data: products }, { data: history }] = await Promise.all([
    supabaseAdmin.from('ai_products').select('*').eq('user_id', userId),
    supabaseAdmin
      .from('whatsapp_messages')
      .select('direction, message_text')
      .eq('user_id', userId)
      .eq('remote_jid', `fb:${senderId}`)
      .order('created_at', { ascending: false })
      .limit(Number(settings.max_history) || 10)
  ]);

  let replyText;
  try {
    const result = await generateAIReply({
      settings,
      products: products || [],
      history: (history || []).reverse(),
      incomingText: text
    });
    replyText = typeof result === 'string' ? result : result.reply || result.text || '';
  } catch (err) {
    console.error('[Facebook] AI reply failed:', err.message);
    replyText = 'ধন্যবাদ! আপনার মেসেজটি পেয়েছি। আমাদের টিম শীঘ্রই রিপ্লাই দেবে।';
  }

  // Log both sides (reuse whatsapp_messages as the unified message log)
  await supabaseAdmin.from('whatsapp_messages').insert([
    {
      user_id: userId,
      remote_jid: `fb:${senderId}`,
      message_id: `fb_in_${Date.now()}`,
      direction: 'incoming',
      message_text: text,
      channel: 'facebook'
    },
    {
      user_id: userId,
      remote_jid: `fb:${senderId}`,
      message_id: `fb_out_${Date.now()}`,
      direction: 'outgoing',
      message_text: replyText,
      channel: 'facebook'
    }
  ]);

  const pageToken = pageRow.page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (pageToken && replyText) {
    await sendMessengerText(pageToken, senderId, replyText);
  }
}

/** POST /webhook/facebook — Meta sends page events here. Always 200 quickly. */
export async function handleFacebookWebhook(req, res) {
  try {
    if (!verifySignature(req)) {
      return res.sendStatus(403);
    }
    const body = req.body || {};
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }
    // Process asynchronously so Meta gets a fast 200
    res.sendStatus(200);

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      const pageRow = await findPageOwner(pageId);
      if (!pageRow) continue;
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const text = event.message?.text;
        if (senderId && text) {
          handleIncomingMessage(pageRow, senderId, text).catch((err) =>
            console.error('[Facebook] handler error:', err.message)
          );
        }
      }
    }
  } catch (err) {
    console.error('[Facebook] webhook error:', err.message);
    if (!res.headersSent) res.sendStatus(500);
  }
}
