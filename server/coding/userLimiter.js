// Tiny per-user sliding-window limiter, used AFTER authentication.
// The IP-keyed express-rate-limit guard alone is a poor fit for a classroom:
// a whole lab sits behind one NAT address, so one IP limit either throttles
// honest students or is too loose to stop a single abusive account.
const buckets = new Map() // key -> timestamps[]

export function userRateLimit({ name, limit, windowMs, message }) {
  return (req, res, next) => {
    const id = req.authUser?.uid || req.authUser?.email || req.ip
    const key = `${name}:${id}`
    const now = Date.now()
    const calls = (buckets.get(key) || []).filter((t) => now - t < windowMs)
    if (calls.length >= limit) {
      buckets.set(key, calls)
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
      return res.status(429).json({ error: message || 'Too many requests — please slow down.' })
    }
    calls.push(now)
    buckets.set(key, calls)
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [k, calls] of buckets) {
    if (!calls.length || now - calls[calls.length - 1] > 10 * 60_000) buckets.delete(k)
  }
}, 5 * 60_000).unref()
