import md5 from 'md5';

console.log("Background Service Worker Loaded (Vite/React)");

const AFFILIATE_CONFIG = {
  amazon: {
    'amazon.com': import.meta.env.VITE_AMAZON_TAG_USA || 'alex3210b-20',
    'amazon.co.uk': import.meta.env.VITE_AMAZON_TAG_UK || 'deluxmerge212-21',
    'amazon.com.au': import.meta.env.VITE_AMAZON_TAG_AU || 'asds0d-22',
    'amazon.ca': 'alex3210b-20',
    'amazon.de': 'alex3210b-20',
    'amazon.fr': 'alex3210b-20',
    'amazon.it': 'alex3210b-20',
    'amazon.es': 'alex3210b-20',
    'amazon.in': 'alex3210b-20',
    'amazon.com.mx': 'alex3210b-20',
    'amazon.com.br': 'alex3210b-20',
  },
  aliexpress: {
    appKey: import.meta.env.VITE_ALIEXPRESS_APP_KEY || '533338',
    appSecret: import.meta.env.VITE_ALIEXPRESS_APP_SECRET || 'l14v0XYkvGMt7rtQ6YIlV1IiU2727ZCB',
    trackingId: import.meta.env.VITE_ALIEXPRESS_TRACKING_ID || 'default',
  },
  ebay: {
    campId: import.meta.env.VITE_EBAY_CAMP_ID || '5339108888',
  },
};

// Sort Amazon domains by length descending so that 'amazon.com.au' matches before 'amazon.com'
const SORTED_AMAZON_DOMAINS = Object.keys(AFFILIATE_CONFIG.amazon).sort((a, b) => b.length - a.length);

// ─── CORRECT API ENDPOINT ────────────────────────────────────────────────────
// eco.taobao.com  → Taobao domestic (WRONG for AliExpress affiliates)
// api.taobao.com  → AliExpress international affiliate API (CORRECT)
// AliExpress Regional API Hosts
const ALI_API_HOST_ALT = 'https://api.aliexpress.com/router/rest';
const ALI_API_HOST_GLOBAL = 'https://api-sg.aliexpress.com/sync';

chrome.runtime.onInstalled.addListener(() => {
  console.log("SoldSnap installed.");
  console.log("Affiliate Config loaded:", {
    amazonDomains: Object.keys(AFFILIATE_CONFIG.amazon),
    aliexpressAppKey: AFFILIATE_CONFIG.aliexpress.appKey,
    aliexpressTrackingId: AFFILIATE_CONFIG.aliexpress.trackingId
  });
});

const htmlCache = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "downloadImages") {
    downloadImages(request.urls, request.folderName);
    sendResponse({ status: "Downloading started" });
  } else if (request.action === "convertAffiliateLink") {
    handleLinkConversion(request.url).then(sendResponse);
    return true;
  } else if (request.action === "fetchHtml") {
    (async () => {
      try {
        const cached = htmlCache.get(request.url);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          sendResponse({ html: cached.html });
          return;
        }

        if (request.url.includes('aliexpress.com')) {
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        }

        const response = await fetch(request.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          }
        });
        const html = await response.text();
        htmlCache.set(request.url, { html, timestamp: Date.now() });
        if (htmlCache.size > 200) {
          const oldestKey = htmlCache.keys().next().value;
          if (oldestKey) htmlCache.delete(oldestKey);
        }
        sendResponse({ html });
      } catch (err: any) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
  return true;
});

// ─── SIGNATURE BUILDER ───────────────────────────────────────────────────────
// Builds a clean, deterministic signature from a params object.
// NEVER pass a params object that already contains a 'sign' key.
function buildSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let raw = secret;
  for (const key of sortedKeys) {
    raw += key + params[key];
  }
  raw += secret;
  return md5(raw).toUpperCase();
}

// ─── TIMESTAMP ───────────────────────────────────────────────────────────────
// AliExpress API expects "yyyy-MM-dd HH:mm:ss" in GMT+8 (China Time)
function getTimestamp(): string {
  const now = new Date();
  // Add 8 hours for GMT+8
  const gmt8 = new Date(now.getTime() + (8 * 60 * 60 * 1000));

  const yyyy = gmt8.getUTCFullYear();
  const MM = String(gmt8.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(gmt8.getUTCDate()).padStart(2, '0');
  const HH = String(gmt8.getUTCHours()).padStart(2, '0');
  const mm = String(gmt8.getUTCMinutes()).padStart(2, '0');
  const ss = String(gmt8.getUTCSeconds()).padStart(2, '0');

  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

// ─── ALIEXPRESS AFFILIATE CONVERSION ─────────────────────────────────────────
async function convertAliExpressLink(originalUrl: string): Promise<{ affiliateUrl: string; error?: string; isError?: boolean }> {
  const { appKey, appSecret, trackingId } = AFFILIATE_CONFIG.aliexpress;

  // Skip non-product pages or security challenge pages
  if (originalUrl.includes('/punish') || originalUrl.includes('captcha') || originalUrl.includes('forbidden')) {
    console.log('[AliExpress] Skipping conversion for security/non-product URL:', originalUrl);
    return { affiliateUrl: originalUrl };
  }

  // Strip all tracking junk — only keep the item ID
  let cleanUrl = '';
  const itemMatch = originalUrl.match(/\/item\/(\d+)\.html/);
  if (itemMatch) {
    cleanUrl = `https://www.aliexpress.com/item/${itemMatch[1]}.html`;
  } else {
    // If not a standard item URL, don't try to convert via API (likely a search or category page)
    console.log('[AliExpress] Not a standard item URL, returning original:', originalUrl);
    return { affiliateUrl: originalUrl };
  }

  console.log('[AliExpress] Original URL:', originalUrl);
  console.log('[AliExpress] Cleaned URL:', cleanUrl);

  // Attempt helper — tries one trackingId and host, returns promotion link or null
  const attempt = async (tid: string, host: string): Promise<string | null> => {
    // Build params WITHOUT sign first
    const params: Record<string, string> = {
      method: 'aliexpress.affiliate.link.generate',
      app_key: appKey,
      sign_method: 'md5',
      timestamp: getTimestamp(),
      format: 'json',
      v: '2.0',
      promotion_link_type: '0',
      source_values: cleanUrl,
      tracking_id: tid,
    };

    // Sign is added AFTER building params — never include it in the signing input
    const sign = buildSign(params, appSecret);
    const body = new URLSearchParams({ ...params, sign });

    const bodyText = body.toString();
    console.log(`[AliExpress] Calling: ${host}`);
    console.log(`[AliExpress] Request Body: ${bodyText}`);

    const response = await fetch(host, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyText,
    });

    if (!response.ok) {
      console.warn(`[AliExpress] Host ${host} returned HTTP ${response.status}`);
      return null;
    }

    const dataText = await response.text();
    console.log('[AliExpress] Raw API Response:', dataText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(dataText);
    } catch (e) {
      console.warn('[AliExpress] Failed to parse JSON from host', host);
      return null;
    }

    console.log('[AliExpress] API Response:', JSON.stringify(data, null, 2));

    if (data.error_response) {
      const code = data.error_response.code || data.error_response.sub_code || '';
      const msg = data.error_response.sub_msg || data.error_response.msg || 'Unknown API error';
      console.warn(`[AliExpress] API error code=${code}, msg=${msg}`);
      console.warn(`[AliExpress] Full error:`, JSON.stringify(data.error_response));

      // Pass the REAL error — don't hide it behind generic message
      throw new Error(`AliExpress API Error [${code}]: ${msg}`);
    }

    const link =
      data?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result
        ?.promotion_links?.promotion_link?.[0]
        ?.promotion_link;

    return link ?? null;
  };

  try {
    const primaryHost = ALI_API_HOST_ALT;
    const fallbackHost = ALI_API_HOST_GLOBAL;

    console.log('[AliExpress] ━━━ Starting affiliate conversion ━━━');
    console.log('[AliExpress] App Key:', appKey);
    console.log('[AliExpress] Tracking ID:', trackingId);
    console.log('[AliExpress] Product URL:', cleanUrl);

    let promoLink: string | null = null;

    // ── Attempt 1: Primary Host ──
    try {
      console.log('[AliExpress] Attempting Primary Host...');
      promoLink = await Promise.race([
        attempt(trackingId, primaryHost),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Primary API request timed out')), 10000))
      ]);
    } catch (primaryErr: any) {
      console.warn('[AliExpress] Primary host attempt failed or timed out:', primaryErr.message);
    }

    // ── Attempt 2: Fallback Host (if Primary failed/timed out) ──
    if (!promoLink) {
      try {
        console.log('[AliExpress] Attempting Fallback Host...');
        promoLink = await Promise.race([
          attempt(trackingId, fallbackHost),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Fallback API request timed out')), 10000))
        ]);
      } catch (fallbackErr: any) {
        console.warn('[AliExpress] Fallback host attempt failed or timed out:', fallbackErr.message);
      }
    }

    if (promoLink) {
      console.log('[AliExpress] ✅ SUCCESS — Affiliate link:', promoLink);
      return { affiliateUrl: promoLink };
    }

    const errMsg = 'AliExpress API did not return an affiliate link after multiple attempts. Check: 1) App Key/Secret validity, 2) Tracking ID status, 3) Product eligibility.';
    console.warn('[AliExpress] ❌ FAILED —', errMsg);
    return { affiliateUrl: originalUrl, error: errMsg, isError: true };

  } catch (err: any) {
    console.warn('[AliExpress] ❌ UNEXPECTED ERROR:', err.message);
    return {
      affiliateUrl: originalUrl,
      error: err.message,
      isError: true,
    };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handleLinkConversion(originalUrl: string) {
  try {
    const urlObj = new URL(originalUrl);
    const host = urlObj.hostname.toLowerCase();

    console.log(`[handleLinkConversion] Request for: ${originalUrl}`);

    // ── Amazon
    for (const domain of SORTED_AMAZON_DOMAINS) {
      if (host.includes(domain)) {
        const tag = (AFFILIATE_CONFIG.amazon as any)[domain];

        // Match ASIN to verify it's a product link
        const asinMatch = originalUrl.match(/\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i);

        if (asinMatch) {
          try {
            const urlObj = new URL(originalUrl);
            urlObj.searchParams.set('tag', tag);
            const affiliateUrl = urlObj.toString();
            console.log(`[handleLinkConversion] Amazon Match (${domain}): ${affiliateUrl}`);
            return { affiliateUrl };
          } catch {
            // Fallback to clean URL if parsing fails
            const cleanUrl = `https://www.${domain}/dp/${asinMatch[1]}?tag=${tag}`;
            return { affiliateUrl: cleanUrl };
          }
        }

        // Fallback if ASIN not found in URL (e.g. search page or home page)
        urlObj.searchParams.set('tag', tag);
        return { affiliateUrl: urlObj.toString() };
      }
    }

    // ── AliExpress
    if (host.includes('aliexpress.com') || host.includes('aliexpress.us')) {
      console.log(`[handleLinkConversion] AliExpress Match`);
      return convertAliExpressLink(originalUrl);
    }

    // ── eBay (Direct Affiliate Link)
    if (host.includes('ebay.')) {
      const url = new URL(originalUrl);
      url.searchParams.set('mkcid', '1');
      let mkrid = '711-53200-19255-0'; // Default USA
      if (host.includes('.co.uk')) mkrid = '710-53481-19255-0';
      else if (host.includes('.com.au')) mkrid = '705-53470-19255-0';
      else if (host.includes('.ca')) mkrid = '706-53473-19255-0';
      else if (host.includes('.de')) mkrid = '707-53477-19255-0';
      else if (host.includes('.fr')) mkrid = '709-53476-19255-0';
      else if (host.includes('.it')) mkrid = '724-53478-19255-0';
      else if (host.includes('.es')) mkrid = '1185-53479-19255-0';

      url.searchParams.set('mkrid', mkrid);
      url.searchParams.set('campid', AFFILIATE_CONFIG.ebay.campId);
      url.searchParams.set('toolid', '10001');
      url.searchParams.set('customid', 'soldsnap');
      url.searchParams.set('mkevt', '1');
      console.log(`[handleLinkConversion] eBay Match: ${url.toString()}`);
      return { affiliateUrl: url.toString() };
    }

    // ── Unsupported domain — return as-is
    return { affiliateUrl: originalUrl };

  } catch (error: any) {
    console.warn('[handleLinkConversion] Unexpected error:', error);
    return {
      affiliateUrl: originalUrl + '#err=' + encodeURIComponent(error.message || 'Unknown Error'),
    };
  }
}

let lastDownloadTime = 0;
let lastDownloadUrlsSignature = '';

// ─── IMAGE DOWNLOADER (PNG CONVERSION) ───────────────────────────────────────
async function downloadImages(urls: string[], folderName: string) {
  // Prevent duplicate downloads triggered within 2 seconds (covers HMR double-listeners, double-clicks, and event propagation)
  const urlsSignature = urls.join('|');
  const now = Date.now();
  if (urlsSignature === lastDownloadUrlsSignature && now - lastDownloadTime < 2000) {
    console.log('[Download] Ignored duplicate download request.');
    return;
  }
  lastDownloadTime = now;
  lastDownloadUrlsSignature = urlsSignature;

  console.log('[DEBUG-BG] downloadImages starting for', urls.length, 'urls:', urls);

  // Clean folder name one more time to be absolutely safe
  const safeFolder = folderName.replace(/[^a-z0-9_-]/gi, '_').substring(0, 50);
  
  // Throttle: Process images in small batches or with delay
  for (let i = 0; i < urls.length; i++) {
    try {
      const url = urls[i];
      if (!url || url.length < 10) continue;
      if (url.startsWith('data:image/svg')) continue;

      console.log(`[Download] Starting ${i + 1}/${urls.length}: ${url.substring(0, 50)}...`);

      let downloadUrl = url;
      let extension = 'jpg';
      
      // Extract extension from URL if possible
      const urlExt = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
      if (urlExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(urlExt)) {
        extension = urlExt === 'jpeg' ? 'jpg' : urlExt;
      }

      // Try PNG conversion for better compatibility/standardization
      // But skip for very large images or if it fails
      try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        
        // If blob is too large (> 5MB), skip conversion to avoid memory/length issues with data URLs
        if (blob.size < 5 * 1024 * 1024) {
          const img = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
            
            // Convert to base64
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(pngBlob);
            });
            
            downloadUrl = dataUrl;
            extension = 'png';
          }
        }
      } catch (convError: any) {
        console.warn(`[Download] Conversion skipped/failed for ${url.substring(0, 30)}:`, convError.message);
        // Fallback to original URL is already set
      }

      await chrome.downloads.download({
        url: downloadUrl,
        filename: `soldsnap/${safeFolder}/image_${i + 1}.${extension}`,
        conflictAction: 'uniquify',
      });

      // Small delay to prevent flooding
      await new Promise(r => setTimeout(r, 300));
      
    } catch (error: any) {
      console.warn(`[Download] Critical failure for image ${i + 1}:`, error.message);
    }
  }
}