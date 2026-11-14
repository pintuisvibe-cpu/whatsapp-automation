/**
 * Multi-Provider AI Reply Engine
 * Supports: Google Gemini, OpenAI, Groq, OpenRouter, Anthropic Claude
 */

export const PROVIDER_DEFAULTS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'google/gemini-2.5-flash',
  anthropic: 'claude-3-5-haiku-latest'
};

export function buildFullSystemPrompt(settings, products = []) {
  const parts = [];
  if (settings.system_prompt) {
    parts.push(settings.system_prompt.trim());
  }
  if (settings.business_knowledge && settings.business_knowledge.trim()) {
    parts.push(`--- BUSINESS KNOWLEDGE & POLICIES ---\n${settings.business_knowledge.trim()}`);
  }
  if (products && products.length > 0) {
    const list = products
      .map((p, i) => `${i + 1}. ${p.name} | Price: ${p.price} | Stock: ${p.stock_status}${p.description ? ` | Info: ${p.description}` : ''}`)
      .join('\n');
    parts.push(`--- PRODUCT CATALOG ---\n${list}`);
  }
  parts.push(
    '--- GUIDELINES ---\nReply directly to the customer as the business AI assistant. Keep messages natural, accurate, and formatted cleanly for WhatsApp.'
  );
  return parts.join('\n\n');
}

export async function generateAIReply({ settings, products = [], history = [], incomingText }) {
  const provider = (settings.provider || 'gemini').toLowerCase();
  const model = settings.model || PROVIDER_DEFAULTS[provider] || 'gemini-2.5-flash';
  const apiKey = (settings.api_key || process.env.DEFAULT_AI_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error(`No API key configured for provider "${provider}". Add your API key in Dashboard -> AI Settings.`);
  }

  const systemInstruction = buildFullSystemPrompt(settings, products);

  // Normalize history into chronological [{ role: 'user' | 'assistant', content }]
  const chatHistory = (history || [])
    .filter((m) => m.message_text && m.message_text.trim())
    .map((m) => ({
      role: m.direction === 'incoming' ? 'user' : 'assistant',
      content: m.message_text
    }));

  if (provider === 'gemini') {
    return callGemini({ apiKey, model, systemInstruction, chatHistory, incomingText });
  }
  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model, systemInstruction, chatHistory, incomingText });
  }
  if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
    return callOpenAICompatible({ provider, apiKey, model, systemInstruction, chatHistory, incomingText });
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

async function callGemini({ apiKey, model, systemInstruction, chatHistory, incomingText }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [
    ...chatHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: incomingText }] }
  ];

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 700
      }
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gemini API error (${resp.status})`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text.trim()) throw new Error('Gemini returned an empty response');
  return { reply: text.trim(), provider: 'gemini', model };
}

async function callOpenAICompatible({ provider, apiKey, model, systemInstruction, chatHistory, incomingText }) {
  const endpoints = {
    openai: 'https://api.openai.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions'
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'https://ai.insafboost.com';
    headers['X-Title'] = 'Insaf AI WhatsApp Bot';
  }

  const messages = [
    { role: 'system', content: systemInstruction },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: incomingText }
  ];

  const resp = await fetch(endpoints[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 700
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `${provider} API error (${resp.status})`);
  }
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error(`${provider} returned an empty response`);
  return { reply: text.trim(), provider, model };
}

async function callAnthropic({ apiKey, model, systemInstruction, chatHistory, incomingText }) {
  const messages = [
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: incomingText }
  ];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: systemInstruction,
      messages
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Anthropic API error (${resp.status})`);
  }
  const text = data?.content?.map((c) => c.text).join('') || '';
  if (!text.trim()) throw new Error('Anthropic returned an empty response');
  return { reply: text.trim(), provider: 'anthropic', model };
}
