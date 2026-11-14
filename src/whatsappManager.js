import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { supabaseAdmin } from './supabase.js';
import {
  clearSupabaseAuthState,
  hasStoredCreds,
  useSupabaseAuthState
} from './supabaseAuthState.js';
import { generateAIReply } from './aiService.js';

const logger = pino({ level: 'silent' });
const activeSockets = new Map(); // userId -> { sock, status, qrDataUrl, qrRaw, phoneNumber, pushName, lastError, connecting, retries }

function getOrInitEntry(userId) {
  if (!activeSockets.has(userId)) {
    activeSockets.set(userId, {
      sock: null,
      status: 'disconnected',
      qrDataUrl: null,
      qrRaw: null,
      phoneNumber: null,
      pushName: null,
      lastError: null,
      connecting: false,
      retries: 0
    });
  }
  return activeSockets.get(userId);
}

async function updateSessionRow(userId, patch) {
  const { error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .upsert(
      {
        user_id: userId,
        ...patch,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    );
  if (error) {
    console.error('[WhatsAppManager] Failed to update whatsapp_sessions:', error.message);
  }
}

function extractMessageText(msg) {
  const m = msg?.message;
  if (!m) return '';
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return '';
}

async function handleIncomingMessage(userId, sock, msg) {
  try {
    if (!msg?.message) return;
    const remoteJid = msg.key?.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;
    if (msg.key?.fromMe) return;

    const text = extractMessageText(msg).trim();
    if (!text) return;

    // Fetch user's AI settings & product catalog
    const [{ data: settings }, { data: products }] = await Promise.all([
      supabaseAdmin.from('ai_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('ai_products').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    const isGroup = remoteJid.endsWith('@g.us');
    if (isGroup && (settings?.ignore_groups ?? true)) {
      return;
    }

    const senderName = msg.pushName || remoteJid.split('@')[0];

    // Log incoming message to Supabase
    await supabaseAdmin.from('whatsapp_messages').insert({
      user_id: userId,
      remote_jid: remoteJid,
      sender_name: senderName,
      direction: 'incoming',
      message_text: text,
      ai_generated: false
    });

    if (!settings || !settings.enabled) {
      return;
    }

    const effectiveKey = (settings.api_key || process.env.DEFAULT_AI_API_KEY || '').trim();
    if (!effectiveKey) {
      console.warn(`[WhatsAppManager] AI enabled for ${userId} but no API key is set.`);
      return;
    }

    // Fetch recent chat history for this remote JID
    const historyLimit = Math.min(Math.max(Number(settings.max_history) || 10, 1), 30);
    const { data: recentRows } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('direction, message_text, created_at')
      .eq('user_id', userId)
      .eq('remote_jid', remoteJid)
      .order('created_at', { ascending: false })
      .limit(historyLimit);

    // Reverse to chronological order and exclude the current incoming message (just inserted)
    const history = (recentRows || []).slice(1).reverse();

    // Show "typing..." presence on WhatsApp
    try {
      await sock.sendPresenceUpdate('composing', remoteJid);
    } catch {}

    const delayMs = Math.min(Math.max(Number(settings.reply_delay_ms) || 1200, 0), 10000);
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const { reply, provider, model } = await generateAIReply({
      settings,
      products: products || [],
      history,
      incomingText: text
    });

    try {
      await sock.sendPresenceUpdate('paused', remoteJid);
    } catch {}

    await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });

    // Log AI outgoing reply
    await supabaseAdmin.from('whatsapp_messages').insert({
      user_id: userId,
      remote_jid: remoteJid,
      sender_name: 'Insaf AI',
      direction: 'outgoing',
      message_text: reply,
      ai_generated: true,
      provider_used: provider,
      model_used: model
    });
  } catch (err) {
    console.error(`[WhatsAppManager] Error handling incoming message for ${userId}:`, err.message);
  }
}

export async function startWhatsAppSession(userId, { resetAuth = false } = {}) {
  const entry = getOrInitEntry(userId);
  if (entry.connecting) {
    return getWhatsAppStatus(userId);
  }

  if (entry.sock) {
    try {
      entry.sock.end(undefined);
    } catch {}
    entry.sock = null;
  }

  if (resetAuth) {
    await clearSupabaseAuthState(userId);
  }

  entry.connecting = true;
  entry.lastError = null;
  entry.qrDataUrl = null;
  entry.status = 'connecting';

  try {
    const { state, saveCreds } = await useSupabaseAuthState(userId);
    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = [2, 3000, 1015901307];
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Insaf AI'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    });

    entry.sock = sock;
    entry.connecting = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          entry.qrRaw = qr;
          entry.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
          entry.status = 'qr_ready';
          entry.lastError = null;
          await updateSessionRow(userId, { status: 'qr_ready', last_error: null });
        } catch (qrErr) {
          console.error('[WhatsAppManager] QR generation error:', qrErr.message);
        }
      }

      if (connection === 'open') {
        entry.qrDataUrl = null;
        entry.qrRaw = null;
        entry.status = 'connected';
        entry.retries = 0;
        entry.lastError = null;
        const phone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
        const pushName = sock.user?.name || 'WhatsApp Business';
        entry.phoneNumber = phone;
        entry.pushName = pushName;

        console.log(`[WhatsAppManager] Connected for user ${userId}: +${phone}`);
        await updateSessionRow(userId, {
          status: 'connected',
          phone_number: phone,
          push_name: pushName,
          last_error: null,
          last_connected_at: new Date().toISOString()
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isQrTimeout = statusCode === 408 || lastDisconnect?.error?.message?.includes('QR refs attempts ended');

        entry.sock = null;
        entry.qrDataUrl = null;

        if (isLoggedOut) {
          console.log(`[WhatsAppManager] Session logged out for user ${userId}`);
          entry.status = 'disconnected';
          entry.phoneNumber = null;
          entry.pushName = null;
          entry.lastError = 'WhatsApp logged out. Scan QR again to reconnect.';
          await clearSupabaseAuthState(userId);
          await updateSessionRow(userId, {
            status: 'disconnected',
            phone_number: null,
            push_name: null,
            last_error: entry.lastError
          });
        } else if (isQrTimeout) {
          entry.status = 'disconnected';
          entry.lastError = 'QR code expired. Click Connect WhatsApp to generate a fresh QR.';
          await updateSessionRow(userId, { status: 'disconnected', last_error: entry.lastError });
        } else if (entry.retries < 5) {
          entry.retries += 1;
          entry.status = 'reconnecting';
          console.log(`[WhatsAppManager] Reconnecting user ${userId} (attempt ${entry.retries}, code=${statusCode})`);
          setTimeout(() => {
            startWhatsAppSession(userId).catch(() => {});
          }, 3000);
        } else {
          entry.status = 'disconnected';
          entry.lastError = `Disconnected (code ${statusCode || 'unknown'}). Click Connect to retry.`;
          await updateSessionRow(userId, { status: 'disconnected', last_error: entry.lastError });
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await handleIncomingMessage(userId, sock, msg);
      }
    });

    return getWhatsAppStatus(userId);
  } catch (err) {
    entry.connecting = false;
    entry.status = 'disconnected';
    entry.lastError = err.message;
    await updateSessionRow(userId, { status: 'disconnected', last_error: err.message });
    throw err;
  }
}

export async function disconnectWhatsAppSession(userId) {
  const entry = getOrInitEntry(userId);
  entry.retries = 999; // prevent auto-reconnect
  if (entry.sock) {
    try {
      await entry.sock.logout();
    } catch {
      try {
        entry.sock.end(undefined);
      } catch {}
    }
    entry.sock = null;
  }
  entry.status = 'disconnected';
  entry.qrDataUrl = null;
  entry.phoneNumber = null;
  entry.pushName = null;
  entry.lastError = null;
  await clearSupabaseAuthState(userId);
  await updateSessionRow(userId, {
    status: 'disconnected',
    phone_number: null,
    push_name: null,
    last_error: null
  });
  return getWhatsAppStatus(userId);
}

export async function getWhatsAppStatus(userId) {
  const entry = activeSockets.get(userId);
  const { data: dbRow } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    status: entry ? entry.status : dbRow?.status || 'disconnected',
    qrDataUrl: entry?.qrDataUrl || null,
    phoneNumber: entry?.phoneNumber || dbRow?.phone_number || null,
    pushName: entry?.pushName || dbRow?.push_name || null,
    lastError: entry?.lastError || dbRow?.last_error || null,
    lastConnectedAt: dbRow?.last_connected_at || null
  };
}

export function getActiveSessionCount() {
  let count = 0;
  for (const entry of activeSockets.values()) {
    if (entry.status === 'connected') count++;
  }
  return count;
}

export async function restoreSavedWhatsAppSessions() {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('status', 'connected');

    if (error) {
      console.error('[WhatsAppManager] Failed to query saved sessions:', error.message);
      return;
    }

    for (const row of rows || []) {
      const credsPresent = await hasStoredCreds(row.user_id);
      if (credsPresent) {
        console.log(`[WhatsAppManager] Restoring saved WhatsApp session for ${row.user_id}...`);
        startWhatsAppSession(row.user_id).catch((err) => {
          console.error(`[WhatsAppManager] Restore failed for ${row.user_id}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error('[WhatsAppManager] Restore error:', err.message);
  }
}
