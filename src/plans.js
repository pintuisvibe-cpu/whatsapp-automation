/**
 * Sales Reply AI — Subscription Plans
 * Mirrors the pricing page at salesreplyai.codexanta.bond/pricing.
 * Prices in BDT (৳), billing period 30 days unless noted.
 */

export const PLANS = {
  free_trial: {
    id: 'free_trial',
    name: 'Free Trial',
    price_bdt: 0,
    period_days: 3,
    messages: 30,
    comment_replies: 10,
    faq_replies: 10,
    products: 5,
    channels: ['facebook', 'whatsapp', 'widget'],
    voice: 'stt',
    popular: false
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    price_bdt: 799,
    period_days: 30,
    messages: 1000,
    comment_replies: 100,
    faq_replies: 100,
    products: 50,
    channels: ['facebook', 'whatsapp', 'widget'],
    voice: 'stt',
    popular: false
  },
  advance: {
    id: 'advance',
    name: 'Advance',
    price_bdt: 1799,
    period_days: 30,
    messages: 2500,
    comment_replies: 500,
    faq_replies: 200,
    products: 70,
    channels: ['facebook', 'whatsapp', 'widget'],
    voice: 'stt',
    popular: true
  },
  business: {
    id: 'business',
    name: 'Business',
    price_bdt: 4499,
    period_days: 30,
    messages: 6500,
    comment_replies: 1000,
    faq_replies: 500,
    products: 70,
    channels: ['facebook', 'whatsapp', 'widget'],
    voice: 'stt',
    popular: false
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_bdt: 9999,
    period_days: 30,
    messages: 15000,
    comment_replies: 2000,
    faq_replies: 1000,
    products: 200,
    channels: ['facebook', 'whatsapp', 'widget'],
    voice: 'both',
    popular: false
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_bdt: null, // custom
    period_days: 30,
    messages: Infinity,
    comment_replies: Infinity,
    faq_replies: Infinity,
    products: Infinity,
    channels: ['facebook', 'whatsapp', 'widget', 'instagram'],
    voice: 'both',
    popular: false
  }
};

export function getPlan(planId) {
  return PLANS[planId] || PLANS.free_trial;
}

/**
 * Check whether a user has remaining AI message quota for the current period.
 * Counts rows in whatsapp_messages + widget_messages created in the last `period_days`.
 * Returns { allowed, used, limit, plan }.
 */
export async function checkMessageQuota(supabaseAdmin, userId, planId) {
  const plan = getPlan(planId);
  if (!Number.isFinite(plan.messages)) {
    return { allowed: true, used: 0, limit: Infinity, plan };
  }
  const since = new Date(Date.now() - plan.period_days * 24 * 60 * 60 * 1000).toISOString();
  const [wa, wg] = await Promise.all([
    supabaseAdmin
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('created_at', since),
    supabaseAdmin
      .from('widget_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('created_at', since)
  ]);
  const used = (wa.count || 0) + (wg.count || 0);
  return { allowed: used < plan.messages, used, limit: plan.messages, plan };
}
