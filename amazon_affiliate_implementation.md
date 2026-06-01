# Amazon Affiliate Link Implementation (LOCKED)

This document records the finalized and working logic for Amazon affiliate link conversion. **DO NOT CHANGE THIS LOGIC** as it has been verified to work for both Organic and Sponsored products.

## Key Strategies

### 1. Tag Appending (Resilience)
Instead of cleaning the URL to a `/dp/ASIN` format, we now **append or update the `tag` parameter** in the existing URL. This prevents Amazon's internal JavaScript from reverting the link or breaking site-specific tracking.

### 2. Global Link Scanner
The extension no longer uses narrow selectors like `a[href*="/dp/"]`. Instead, it scans **ALL** anchor tags (`a[href]`) and filters them using a robust ASIN regex.
- **Regex:** `/\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i`

### 3. Broad Click Interceptor
A capture-phase click listener is applied to the entire document. It finds the nearest anchor tag for any click and applies a synchronous conversion fallback. This catches links that might be dynamically generated or missed by the scanner.

### 4. Product Page Sync
On product pages, the extension uses both a synchronous check (via `history.replaceState`) and an asynchronous background backup to ensure the affiliate tag is always present in the address bar. It also listens to `popstate` for dynamic navigation.

## Verified URL Patterns
- Organic: `https://www.amazon.com/Title/dp/ASIN/ref=...`
- Mobile: `https://www.amazon.com/gp/aw/d/ASIN/...`
- Sponsored: Any link containing a valid ASIN pattern.

---
**Status:** WORKING & STABLE
**Last Verified:** 2026-05-11
