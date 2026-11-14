import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import { supabaseAdmin } from './supabase.js';

/**
 * Custom Baileys AuthState adapter stored inside Supabase PostgreSQL (`public.whatsapp_auth_keys`).
 * Ensures WhatsApp QR sessions survive Render Free Plan restarts and ephemeral disk resets.
 */
export async function useSupabaseAuthState(userId) {
  const memoryCache = new Map();

  // Preload all keys for this user into memory for fast Signal encryption lookups
  const { data: rows, error } = await supabaseAdmin
    .from('whatsapp_auth_keys')
    .select('key_id, value_json')
    .eq('user_id', userId);

  if (error) {
    throw new Error('Failed to load WhatsApp auth state from Supabase: ' + error.message);
  }

  for (const row of rows || []) {
    try {
      const parsed = JSON.parse(JSON.stringify(row.value_json), BufferJSON.reviver);
      memoryCache.set(row.key_id, parsed);
    } catch {
      memoryCache.set(row.key_id, row.value_json);
    }
  }

  const writeData = async (keyId, value) => {
    memoryCache.set(keyId, value);
    const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    const { error: upsertErr } = await supabaseAdmin
      .from('whatsapp_auth_keys')
      .upsert(
        {
          user_id: userId,
          key_id: keyId,
          value_json: serialized,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,key_id' }
      );
    if (upsertErr) {
      console.error(`[SupabaseAuthState] Upsert error for ${keyId}:`, upsertErr.message);
    }
  };

  const removeData = async (keyId) => {
    memoryCache.delete(keyId);
    const { error: delErr } = await supabaseAdmin
      .from('whatsapp_auth_keys')
      .delete()
      .eq('user_id', userId)
      .eq('key_id', keyId);
    if (delErr) {
      console.error(`[SupabaseAuthState] Delete error for ${keyId}:`, delErr.message);
    }
  };

  const creds = memoryCache.get('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            const keyId = `${type}-${id}`;
            let value = memoryCache.get(keyId);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            if (value !== undefined) {
              result[id] = value;
            }
          }
          return result;
        },
        set: async (data) => {
          const ops = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              if (value) {
                ops.push(writeData(keyId, value));
              } else {
                ops.push(removeData(keyId));
              }
            }
          }
          await Promise.all(ops);
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    }
  };
}

export async function clearSupabaseAuthState(userId) {
  const { error } = await supabaseAdmin
    .from('whatsapp_auth_keys')
    .delete()
    .eq('user_id', userId);
  if (error) {
    console.error('[SupabaseAuthState] Clear error:', error.message);
  }
}

export async function hasStoredCreds(userId) {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_auth_keys')
    .select('key_id')
    .eq('user_id', userId)
    .eq('key_id', 'creds')
    .maybeSingle();
  return !error && Boolean(data);
}
