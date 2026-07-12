// Vercel serverless function: POST /api/subscribe
// Accepts { email } and stores it in an Upstash Redis set.
// Deduplication is automatic (Redis sets); first-seen timestamp per email is tracked in a hash.
// Env vars UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are injected by the Vercel/Upstash integration.

import { Redis } from '@upstash/redis';

// The Upstash Vercel Marketplace integration injects UPSTASH_REDIS_REST_URL / _TOKEN.
// Some setups use KV_REST_API_URL / _TOKEN instead. Cover both.
const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = new Redis({ url, token });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const raw = (body && body.email) || '';
  const email = String(raw).trim().toLowerCase();

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email.' });
  }

  try {
    await redis.sadd('subscribers', email);
    // hsetnx = set only if the field does NOT already exist, so we keep the first-seen timestamp
    await redis.hsetnx('subscriber_first_seen', email, Date.now());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error', err);
    return res.status(500).json({ error: 'Something went wrong. Try again in a bit.' });
  }
}
