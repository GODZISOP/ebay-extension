const extractImages = (): string[] => {
  const imgSet = new Set<string>();

  try {
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].textContent || '';
      if (content.includes('imagePathList') || content.includes('productImagePaths')) {
        const match = content.match(/"(?:imagePathList|productImagePaths)"\s*:\s*(\[[^\]]+\])/);
        if (match && match[1]) {
          const urls = JSON.parse(match[1]);
          urls.forEach((url: string) => {
            const clean = url.startsWith('http') ? url : `https:${url}`;
            imgSet.add(clean);
          });
          break;
        }
      }
    }
  } catch (e) {
    console.warn("Error parsing script tags for images", e);
    return [];
  }

  if (imgSet.size === 0) {
    document.querySelectorAll('img').forEach(img => {
      const src =
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-zoom-image') ||
        img.getAttribute('data-ks-lazyload') ||
        img.getAttribute('data-image-src') ||
        img.currentSrc ||
        img.getAttribute('src') || '';

      if (!src || src.startsWith('data:') || src.length < 20) return;

      if (src.includes('alicdn.com') || src.includes('aliexpress')) {
        const clean = src
          .replace(/^http:/, 'https:')
          .split('?')[0]
          .replace(/_\d+x\d+[^.]*(\.\w+)$/, '$1');
        imgSet.add(clean);
      }
    });
  }

  return [...imgSet].filter(url => url.length > 10).slice(0, 30);
};

// ─── CURRENCY HELPERS ────────────────────────────────────────────────────────
// ROOT CAUSE FIX: AliExpress UK/GBP renders ￡ (U+FFE1 FULLWIDTH POUND SIGN)
// instead of the standard £ (U+00A3). All previous regexes only checked £ and
// therefore silently failed to match any GBP price on UK locale pages.
// Fix: every currency pattern now includes \uFFE1 alongside £.
//
//   Standard pound  : £  U+00A3
//   Fullwidth pound : ￡  U+FFE1  ← what AliExpress actually renders
//
// CURRENCY_CHARS   — used in character classes  e.g. [\$£\uFFE1€¥₹]
// isCurrencyText   — quick validation that a string looks like a price
// parseCurrencyText — extracts "SYMBOL amount" even when split across siblings

const CURRENCY_CHARS = /[\$\xA3\uFFE1\u20AC\xA5\u20B9]/; // $£￡€¥₹

const isCurrencyText = (text: string): boolean =>
  /[\$\xA3\uFFE1\u20AC\xA5\u20B9]|US\s?\$|AU?\s?\$|GBP[\s\d]|GBP$|AED|[A-Z]{2,3}\s?[\d.,]/.test(
    text
  );

const parseCurrencyText = (raw: string): string | null => {
  // Collapse whitespace/newlines so "GBP\n12.99" or "￡\n10.93" → single token
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const m = collapsed.match(
    /(GBP|USD|AUD|EUR|AED|PKR|[\$\xA3\uFFE1\u20AC\xA5\u20B9])\s*([\d,.]+)/i
  );
  return m ? `${m[1]} ${m[2]}` : null;
};

const extractAliExpressData = async () => {
  // ── Title ──────────────────────────────────────────────────────────────────
  const title =
    (document.querySelector('h1') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('h1[class*="title"]') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('.pdp-info-right h1') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('[class*="product-title"]') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content ||
    "Title not found";

  let price = "Price not found";
  let originalPrice = "";

  const priceSelectors = [
    '[class*="price--current"]',
    '[class*="price-sale"]',
    '[class*="price_sale"]',
    '[class*="currentPrice"]',
    '[class*="salePrice"]',
    '[data-role="current-price"]',
    '.product-price-value',
    '.pdp-price',
    '[class*="uniform-banner-box-price"]',
    '[class*="product-price"]',
    '[class*="priceText--"]',
    '[data-pl="product-price"]',
    // GBP / UK locale specific
    '[class*="price--gb"]',
    '[class*="pdp-comp-price"]',
    '[data-spm*="price"]',
    '.pdp-comp-price-main',
    '[class*="price-main"]',
    '[class*="uniformBannerBoxPrice"]',
  ];

  // Pass 1: selector-based — normalise whitespace then validate
  for (const sel of priceSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    const text = el?.innerText?.replace(/\s+/g, ' ').trim();
    if (text && text.length < 50 && isCurrencyText(text)) {
      price = text;
      break;
    }
  }

  // Pass 2: sibling-span fix — ￡ and amount may be in separate child <span>s
  if (price === "Price not found") {
    const priceArea = document.querySelector(
      '[class*="price"], [class*="Price"], [data-pl="product-price"]'
    ) as HTMLElement;
    if (priceArea) {
      const extracted = parseCurrencyText(priceArea.innerText || '');
      if (extracted) price = extracted;
    }
  }

  // Pass 3: meta tags
  if (price === "Price not found") {
    const metaPrice =
      (document.querySelector('meta[property="og:price:amount"]') as HTMLMetaElement)?.content ||
      (document.querySelector('meta[name="twitter:data1"]') as HTMLMetaElement)?.content;
    const metaCurrency =
      (document.querySelector('meta[property="og:price:currency"]') as HTMLMetaElement)
        ?.content || "$";
    if (metaPrice) price = `${metaCurrency} ${metaPrice}`.trim();
  }

  // Pass 4: brute-force DOM scan — \uFFE1 ensures ￡10.93 is matched
  if (price === "Price not found") {
    const allEls = document.querySelectorAll('span, div, strong, b');
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i] as HTMLElement;
      if (el.children.length > 1) continue;
      const text = el.innerText?.replace(/\s+/g, ' ').trim();
      if (!text || text.length > 30) continue;
      if (
        /^(US\s?\$|AU?\s?\$|GBP|AED|[\$\xA3\uFFE1\u20AC\xA5\u20B9]|PKR|Rs\.?|[A-Z]{2,3}\s?)\s?[\d,. ]+$/i.test(
          text
        )
      ) {
        price = text;
        break;
      }
    }
  }

  // ── Original / strikethrough price ────────────────────────────────────────
  const origSelectors = [
    '[class*="price--del"]',
    '[class*="price-del"]',
    '[class*="price--origin"]',
    '[class*="originalPrice"]',
    '[class*="price_origin"]',
    'del',
  ];
  for (const sel of origSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    const text = el?.innerText?.trim();
    if (text && text !== price && text.length < 40) {
      originalPrice = text;
      break;
    }
  }

  const images = extractImages();

  // ── Seller ─────────────────────────────────────────────────────────────────
  let seller = "Seller not found";
  const sellerSelectors = [
    '[class*="shop-name"]',
    '[class*="storeName"]',
    '[class*="store-name"]',
    '.store-header .store-name',
    'a[href*="/store/"]',
    '[class*="shop-header"] h1',
    '[class*="seller-name"]',
    '.shop-name a',
    '.store-name a',
    '[data-pl="seller-name"]',
  ];
  for (const sel of sellerSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    const t = el?.innerText?.trim();
    if (t && t.length > 1) { seller = t; break; }
  }

  if (seller === "Seller not found" || seller === "Trader") {
    const pageText = document.body.innerText;
    const soldByMatch =
      pageText.match(/Sold\s*By\s*:\s*([^\n]+)/i) ||
      pageText.match(/Sold\s*By\s*([^\n]+)/i) ||
      pageText.match(/Store\s*Name\s*:\s*([^\n]+)/i);

    if (soldByMatch) {
      seller = soldByMatch[1].trim().replace(/\(Trader\)/i, '').trim();
    } else {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const storeLink = allLinks.find(
        a => a.href.includes('/store/') || a.href.includes('aliexpress.com/store/')
      );
      if (storeLink && storeLink.textContent?.trim()) seller = storeLink.textContent.trim();
    }
  }

  // ── Shipping & Delivery ───────────────────────────────────────────────────
  const shipping =
    (document.querySelector('[class*="shipping-line"]') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('.pdp-info-right .shipping-info') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('[class*="delivery--"]') as HTMLElement)?.innerText
      .split('\n')[0]
      .trim() ||
    "N/A";

  let delivery =
    (
      document.querySelector(
        '[class*="delivery-day"], [class*="delivery-time"]'
      ) as HTMLElement
    )?.innerText.trim() ||
    (document.querySelector('.dynamic-shipping-line') as HTMLElement)?.innerText.trim() ||
    (
      document.querySelector('[class*="delivery--"] [class*="day"]') as HTMLElement
    )?.innerText.trim() ||
    "N/A";

  if (delivery === "N/A" || delivery.includes('PKR') || delivery.includes('Shipping')) {
    const pageText = document.body.innerText;
    const deliveryMatch =
      pageText.match(/Delivery:\s*([A-Z][a-z]{2,8}\s*\d+(?:\s*-\s*\d+)?)/i) ||
      pageText.match(
        /(?:delivery|delivered|arrive by|arrival|delivered\s*on)\s*(?:on|by|between)?\s*([A-Z][a-z]{2,8}\s*\d+(?:\s*-\s*[^\n,]+)?)/i
      ) ||
      pageText.match(/Estimated\s+delivery\s+on\s+([A-Z][a-z]+\s+\d+)/i);
    if (deliveryMatch) delivery = deliveryMatch[1].trim();
  }

  // ── Item Rating ───────────────────────────────────────────────────────────
  let itemRating =
    (
      document.querySelector(
        '.pdp-review-score, [class*="reviewer--"] [class*="score"], [class*="rating--"] [class*="score"], [class*="ratingText"]'
      ) as HTMLElement
    )?.innerText.trim() || "N/A";

  if (itemRating === "N/A" || itemRating === "") {
    const metaRating =
      (document.querySelector('meta[itemprop="ratingValue"]') as HTMLMetaElement)?.content ||
      (document.querySelector('meta[property="og:rating"]') as HTMLMetaElement)?.content;
    if (metaRating) itemRating = metaRating;
  }

  if (itemRating === "N/A" || itemRating === "") {
    try {
      const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of Array.from(jsonScripts)) {
        const content = s.textContent || '';
        if (content.includes('ratingValue')) {
          const m = content.match(/"ratingValue"\s*:\s*"*([\d.]+)"*/i);
          if (m) { itemRating = m[1]; break; }
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (itemRating === "N/A" || itemRating === "") {
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        const content = s.textContent || '';
        if (
          content.includes('averageStar') ||
          content.includes('avgRating') ||
          content.includes('ratingScore')
        ) {
          const m = content.match(
            /"(?:averageStar|avgRating|averageScore|ratingScore)"\s*:\s*"*([\d.]+)"*/i
          );
          if (m) { itemRating = m[1]; break; }
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (itemRating === "N/A" || itemRating === "") {
    const itemMatch =
      document.body.innerText.match(
        /(\d\.\d)\s*[\n\r]*\s*(?:Reviews|ratings|score|average)/i
      ) || document.body.innerText.match(/([\d.]+)\s*\/\s*5/i);
    if (itemMatch) itemRating = itemMatch[1];
  }

  // ── Seller Rating ─────────────────────────────────────────────────────────
  let sellerRating =
    (
      document.querySelector(
        '[class*="positive-fdb"], [class*="store-rating"]'
      ) as HTMLElement
    )?.innerText.trim() ||
    (document.querySelector('.shop-header .rating-num') as HTMLElement)?.innerText.trim() ||
    "N/A";

  if (sellerRating === "N/A") {
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        const content = s.textContent || '';
        if (content.includes('positiveFeedbackRate')) {
          const m = content.match(/"positiveFeedbackRate"\s*:\s*"([^"]+)"/i);
          if (m) { sellerRating = m[1]; break; }
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (sellerRating === "N/A") {
    const ratingMatch = document.body.innerText.match(/(\d+(?:\.\d+)?%\s*Positive Feedback)/i);
    if (ratingMatch) sellerRating = ratingMatch[1];
  }

  const rating = itemRating !== "N/A" && itemRating !== "" ? `${itemRating} ⭐` : "N/A";
  const sellerRatingValue = sellerRating;

  // ── Rank ──────────────────────────────────────────────────────────────────
  let rank = "N/A";
  const rankSelectors = [
    '[class*="rank-text"]',
    '[class*="ranking--"]',
    '.pdp-rank',
    '[class*="top-ranking"]',
  ];
  for (const sel of rankSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    if (el && el.innerText.trim()) { rank = el.innerText.trim(); break; }
  }
  if (rank === "N/A") {
    const rankMatch = document.body.innerText.match(
      /(#\d+\s+(?:Top\s+)?(?:Selling|Ranking)\s+in\s+[^\n]+)/i
    );
    if (rankMatch) rank = rankMatch[1];
  }

  // ── Sold Count ────────────────────────────────────────────────────────────
  let soldCount =
    (document.querySelector('[class*="trade-count"]') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('[class*="sold"]') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('[class*="tradeCount"]') as HTMLElement)?.innerText.trim() ||
    "N/A";
  if (soldCount === "N/A") {
    const sMatch = document.body.innerText.match(/([\d,+]+\s+sold)/i);
    if (sMatch) soldCount = sMatch[0];
  }

  // ── Item ID ───────────────────────────────────────────────────────────────
  const idMatch =
    window.location.href.match(/\/item\/(\d+)\.html/) ||
    window.location.href.match(/item_id=(\d+)/);
  const asin = idMatch ? idMatch[1] : "N/A";

  // ── Quantity Available ────────────────────────────────────────────────────
  let qty = "Unknown";
  const qtySelectors = [
    '[class*="quantity--"]',
    '[class*="Quantity--"]',
    '.pdp-info-right .quantity-info',
    '[class*="inventory"]',
    '[class*="stock"]',
    '[class*="avail"]',
  ];
  for (const sel of qtySelectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent?.trim()) {
      const txt = el.textContent.trim();
      const match =
        txt.match(/([\d,]+)\s+pieces?\s+available/i) ||
        txt.match(/([\d,]+)\s+available/i) ||
        txt.match(/([\d,]+)\s+left/i) ||
        txt.match(/([\d,]+)\s+in\s+stock/i);
      if (match) { qty = match[1]; break; }
    }
  }
  if (qty === "Unknown") {
    const qtyInput = document.querySelector(
      'input[type="number"], input[class*="quantity"], input[class*="Quantity"]'
    ) as HTMLInputElement;
    if (qtyInput) {
      const max =
        qtyInput.getAttribute('max') ||
        qtyInput.getAttribute('data-max') ||
        qtyInput.getAttribute('aria-valuemax');
      if (max && parseInt(max) > 0) qty = max;
    }
  }
  if (qty === "Unknown") {
    const pageText = document.body.innerText;
    const qtyMatch =
      pageText.match(/([\d,]+)\s+pieces?\s+available/i) ||
      pageText.match(/([\d,]+)\s+available/i) ||
      pageText.match(/Only\s+([\d,]+)\s+left/i) ||
      pageText.match(/([\d,]+)\s+left\s+in\s+stock/i) ||
      pageText.match(/([\d,]+)\s+left/i) ||
      pageText.match(/([\d,]+)\s+in\s+stock/i);
    if (qtyMatch) qty = qtyMatch[1];
  }

  // ── Delivery (second pass) ────────────────────────────────────────────────
  if (delivery === "N/A" || delivery === "") {
    const pageText = document.body.innerText;
    const dMatch =
      pageText.match(
        /Delivery:\s*([A-Z][a-z]{2}\.?\s*\d+\s*-\s*[A-Z][a-z]{2}\.?\s*\d+)/i
      ) ||
      pageText.match(/Delivery:\s*([A-Z][a-z]{2}\.?\s*\d+)/i) ||
      pageText.match(/Estimated\s+delivery\s+on\s+([A-Z][a-z]+\s+\d+)/i);
    if (dMatch) delivery = dMatch[1];
  }

  // ── _init_data_ / runParams fallback (GBP nested price fields) ───────────
  if (price === "Price not found" || seller === "Seller not found") {
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        const content = s.textContent || '';
        if (content.includes('_init_data_') || content.includes('window.runParams')) {
          if (price === "Price not found") {
            const pMatch =
              content.match(
                /"(?:actPrice|salePrice|formatedAmount|formatedActivityPrice|discountPrice|originalPriceText|priceText|minActivityAmount)"\s*:\s*"([^"]+)"/i
              ) ||
              content.match(
                /"(?:minAmount|maxAmount)"\s*:\s*\{[^}]*"formatedAmount"\s*:\s*"([^"]+)"/i
              ) ||
              content.match(/"priceText"\s*:\s*"([^"]+)"/i);
            if (pMatch) price = pMatch[1];
          }
          if (seller === "Seller not found") {
            const sMatch = content.match(/"(?:storeName|shopName)"\s*:\s*"([^"]+)"/i);
            if (sMatch) seller = sMatch[1];
          }
          if (price !== "Price not found" && seller !== "Seller not found") break;
        }
      }
    } catch (e) { /* ignore */ }
  }

  return {
    platform: "AliExpress",
    title,
    price,
    originalPrice,
    images,
    seller,
    shipping,
    delivery,
    rating,
    sellerRating: sellerRatingValue,
    soldCount,
    rank,
    asin,
    qty,
    url: window.location.href,
  };
};

import { mountOverlay, mountAliSearchCard } from './mount';
import { debounce } from '../utils/performance';

const initAliExpressExtension = () => {
  const isProductPage = window.location.href.includes('/item/');
  const isSearch = !isProductPage;

  const sellerCache: Record<string, string> = {};

  let activeAliRequests = 0;
  const MAX_CONCURRENT_ALI = 1;
  const aliQueue: Array<() => void> = [];

  const enqueueAli = (task: () => void) => {
    if (activeAliRequests < MAX_CONCURRENT_ALI) {
      activeAliRequests++;
      task();
    } else {
      aliQueue.push(task);
    }
  };

  const dequeueAli = () => {
    activeAliRequests--;
    if (aliQueue.length > 0) {
      const next = aliQueue.shift()!;
      activeAliRequests++;
      next();
    }
  };

  const fetchSellerName = async (itemId: string): Promise<string> => {
    if (sellerCache[itemId]) return sellerCache[itemId];

    return new Promise((resolve) => {
      enqueueAli(async () => {
        try {
          const domain = window.location.hostname.replace('www.', '');
          const response: any = await new Promise((resMsg) => {
            chrome.runtime.sendMessage(
              { action: 'fetchHtml', url: `https://www.${domain}/item/${itemId}.html` },
              resMsg
            );
          });

          if (!response?.html) {
            resolve("AliExpress Seller");
          } else {
            const html = response.html;
            let m = html.match(/"storeName"\s*:\s*"([^"]+)"/);
            if (m) { sellerCache[itemId] = m[1]; resolve(m[1]); return; }
            m = html.match(/"shopName"\s*:\s*"([^"]+)"/);
            if (m) { sellerCache[itemId] = m[1]; resolve(m[1]); return; }
            m = html.match(/Sold\s*[Bb]y[\s\S]*?class[^>]*>([^<]{2,40})\s*Store/);
            if (m) {
              sellerCache[itemId] = m[1].trim() + ' Store';
              resolve(sellerCache[itemId]);
              return;
            }
            m = html.match(/class="[^"]*store[^"]*"[^>]*title="([^"]+)"/i);
            if (m) { sellerCache[itemId] = m[1]; resolve(m[1]); return; }
            m = html.match(/"sellerAdminSeq"\s*:\s*\d+[\s\S]*?"name"\s*:\s*"([^"]+)"/);
            if (m) { sellerCache[itemId] = m[1]; resolve(m[1]); return; }
            resolve("AliExpress Seller");
          }
        } catch {
          resolve("AliExpress Seller");
        } finally {
          dequeueAli();
        }
      });
    });
  };

  if (isSearch) {
    const processSearchCards = () => {
      const cards = document.querySelectorAll(
        '.multi--container--15ulv94, [class*="product-card"], a[href*="/item/"]'
      );
      cards.forEach(card => {
        const link =
          card.tagName === 'A'
            ? (card as HTMLAnchorElement)
            : (card.querySelector('a[href*="/item/"]') as HTMLAnchorElement);
        if (!link) return;

        const match = link.href.match(/\/item\/(\d+)\.html/);
        const itemId = match ? match[1] : null;
        if (!itemId) return;

        const existing =
          card.querySelector('.grab-ali-mount') || card.closest('.grab-ali-mount');
        if (existing) return;
        if (card.hasAttribute(`data-grab-injected-${itemId}`)) return;
        if (
          card.tagName === 'A' &&
          card.closest('.multi--container--15ulv94, [class*="product-card"]')
        )
          return;

        card.setAttribute(`data-grab-injected-${itemId}`, 'true');
        card.setAttribute('data-grab-injected', 'true');
        const titleEl = card.querySelector(
          'h3, .multi--titleText--nxeH4x9, [class*="title--"]'
        );
        const title = titleEl?.textContent?.trim() || "AliExpress Product";

        // Search card price — match any supported currency incl. ￡
        let price = "N/A";
        const cardPriceSelectors = [
          '[class*="price--current"]',
          '[class*="priceText"]',
          '[class*="price--"]',
          '[class*="Price--"]',
          '.price-current',
          '.price-value',
        ];
        for (const selector of cardPriceSelectors) {
          const el = card.querySelector(selector) as HTMLElement;
          const t = el?.innerText?.replace(/\s+/g, ' ').trim();
          if (t && CURRENCY_CHARS.test(t)) { price = t; break; }
        }
        if (price === "N/A") {
          const cardText = (card as HTMLElement).innerText || "";
          const priceMatch = cardText.match(
            /(PKR|[\$\xA3\uFFE1\u20AC\xA5\u20B9]|GBP|USD|AUD)\s*[\d,]+(\.\d{1,2})?/i
          );
          if (priceMatch) price = priceMatch[0];
        }

        let soldCount = "N/A";
        const soldSelectors = [
          '[class*="trade--"]',
          '[class*="sold--"]',
          '[class*="tradeCount"]',
        ];
        for (const selector of soldSelectors) {
          const el = card.querySelector(selector) as HTMLElement;
          if (el && el.innerText?.trim()) { soldCount = el.innerText.trim(); break; }
        }
        if (soldCount === "N/A") {
          const cardText = (card as HTMLElement).innerText || "";
          const soldMatch = cardText.match(/[\d,]+[+K]*\s+sold/i);
          if (soldMatch) soldCount = soldMatch[0];
        }

        let rating = "N/A";
        const cardText = (card as HTMLElement).innerText || "";
        const ratingMatch =
          cardText.match(/([\d.]+)\s*(\/5)?\s*(\d+)?\s*sold/i) ||
          cardText.match(/([\d.]+)\s*star/i);
        if (
          ratingMatch &&
          parseFloat(ratingMatch[1]) <= 5 &&
          parseFloat(ratingMatch[1]) >= 1
        ) {
          rating = ratingMatch[1];
        } else {
          const starEl = card.querySelector('[class*="rating--"], [class*="star--"]');
          if (starEl) {
            const sMatch = (starEl as HTMLElement).innerText.match(/([\d.]+)/);
            if (sMatch) rating = sMatch[1];
          }
        }

        let delivery = "N/A";
        const deliverySelectors = [
          '[class*="delivery--"]',
          '[class*="shipping--"]',
          '.multi--delivery--2L_H5_G',
          '[class*="service--"]',
        ];
        for (const selector of deliverySelectors) {
          const el = card.querySelector(selector) as HTMLElement;
          if (el && el.innerText?.trim()) {
            const text = el.innerText.trim();
            if (
              text.toLowerCase().includes('shipping') ||
              text.toLowerCase().includes('delivery') ||
              text.toLowerCase().includes('arrives')
            ) {
              delivery = text;
              break;
            }
          }
        }
        if (delivery === "N/A") {
          const cardText = (card as HTMLElement).innerText || "";
          if (cardText.includes('Free shipping')) delivery = "Free shipping";
          else if (cardText.includes('shipping')) {
            const sMatch = cardText.match(
              /(PKR|[\$\xA3\uFFE1\u20AC\xA5\u20B9]|GBP|USD|AUD)\s*[\d,.]+\s*shipping/i
            );
            if (sMatch) delivery = sMatch[0];
          }
        }

        (card as HTMLElement).style.position = 'relative';
        const imgEl = card.querySelector('img') as HTMLImageElement;
        const imageUrl = imgEl?.src || '';

        mountAliSearchCard(itemId, title, card, {
          price,
          seller: "⏳ Loading...",
          soldCount,
          rating,
          imageUrl,
          delivery,
        });

        fetchSellerName(itemId).then(sellerName => {
          const mountedOverlay = card.querySelector('.grab-ali-mount');
          if (mountedOverlay) {
            const sellerSpan = mountedOverlay.querySelector('[data-field="seller"]');
            if (sellerSpan) sellerSpan.textContent = sellerName;
          }
        });
      });
    };

    const updateLinks = () => {
      const links = document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/item/"]:not([data-grab-tagged="true"]), a[href*="aliexpress."][href*="item/"]:not([data-grab-tagged="true"])'
      );
      links.forEach(anchor => {
        const absHref = new URL(anchor.href, window.location.origin).href;
        if (absHref.includes('s.click.aliexpress.com')) {
          anchor.setAttribute('data-grab-tagged', 'true');
          anchor.setAttribute('data-grab-converted', 'true');
          return;
        }
        anchor.setAttribute('data-grab-tagged', 'true');
        chrome.runtime.sendMessage(
          { action: "convertAffiliateLink", url: absHref },
          (response) => {
            if (response?.affiliateUrl && response.affiliateUrl !== absHref) {
              anchor.href = response.affiliateUrl;
              anchor.setAttribute('data-grab-converted', 'true');
            }
          }
        );
      });
    };

    const debouncedProcess = debounce(processSearchCards, 1000);
    const debouncedUpdateLinks = debounce(updateLinks, 2000);

    let lastUrl = window.location.href;
    const observer = new MutationObserver((mutations) => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        processSearchCards();
        updateLinks();
      }
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) { shouldProcess = true; break; }
      }
      if (shouldProcess) { debouncedProcess(); debouncedUpdateLinks(); }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '[class*="filter"], [class*="category"], [class*="tick"], input[type="checkbox"]'
        )
      ) {
        setTimeout(() => { processSearchCards(); updateLinks(); }, 2000);
      }
    });

    processSearchCards();
    updateLinks();

    // ─── AFFILIATE CLICK INTERCEPTOR ─────────────────────────────────────────
    document.addEventListener(
      'click',
      async (e) => {
        const anchor = (e.target as HTMLElement).closest?.(
          'a[href*="/item/"]'
        ) as HTMLAnchorElement | null;
        if (!anchor || !anchor.href) return;

        const absHref = new URL(anchor.href, window.location.origin).href;
        if (absHref.includes('s.click.aliexpress.com')) return;

        if (anchor.getAttribute('data-grab-converted') !== 'true') {
          e.preventDefault();
          e.stopPropagation();

          console.log(
            '%c[SoldSnap] Affiliate click intercepted',
            'color: #00ff00; font-weight: bold',
            absHref
          );

          chrome.runtime.sendMessage(
            { action: "convertAffiliateLink", url: absHref },
            (response) => {
              const finalUrl =
                response?.affiliateUrl && response.affiliateUrl !== absHref
                  ? response.affiliateUrl
                  : absHref;

              anchor.href = finalUrl;
              anchor.setAttribute('data-grab-converted', 'true');

              console.log(
                '%c[SoldSnap] Redirecting to:',
                'color: #00ff00; font-weight: bold',
                finalUrl
              );

              if (anchor.target === '_blank') {
                window.open(finalUrl, '_blank');
              } else {
                window.location.href = finalUrl;
              }
            }
          );
        }
      },
      { capture: true }
    );
  } else {
    let mountTries = 0;
    const tryMount = () => {
      extractAliExpressData().then(data => {
        if (document.querySelector('.grab-history-mount')) return;
        if (
          data.title !== "Title not found" ||
          data.price !== "Price not found" ||
          mountTries > 10
        ) {
          const selectors = [
            'h1',
            '[class*="title--"]',
            '.pdp-info-right',
            '[class*="pdp-info-"]',
            '#root',
            '.product-title',
            'body',
          ];
          let target: string | null = null;
          for (const s of selectors) {
            if (document.querySelector(s)) { target = s; break; }
          }
          mountOverlay(data, target || 'body', true);
        }
        if (mountTries < 40) { mountTries++; setTimeout(tryMount, 1000); }
      });
    };
    tryMount();

    // ─── AUTO-CONVERT PRODUCT PAGE URL ───────────────────────────────────────
    const isAlreadyAffiliate = (url: string) =>
      url.includes('s.click.aliexpress.com') ||
      url.includes('aff_fcid') ||
      url.includes('aff_platform=api-new-link-generate') ||
      url.includes('/punish') ||
      url.includes('captcha');

    setTimeout(() => {
      const currentUrl = window.location.href;
      if (isAlreadyAffiliate(currentUrl)) return;

      console.log(
        '%c[SoldSnap] Auto-converting product page URL...',
        'color: #00aaff; font-weight: bold',
        currentUrl
      );

      chrome.runtime.sendMessage(
        { action: "convertAffiliateLink", url: currentUrl },
        (response) => {
          if (response?.affiliateUrl && response.affiliateUrl !== currentUrl) {
            try {
              const affHostname = new URL(response.affiliateUrl).hostname;
              const curHostname = new URL(currentUrl).hostname;

              if (affHostname === curHostname) {
                window.history.replaceState(null, '', response.affiliateUrl);
              } else {
                const lastRedirect = sessionStorage.getItem('last_ali_redirect');
                const now = Date.now();
                if (!lastRedirect || now - parseInt(lastRedirect) > 10000) {
                  sessionStorage.setItem('last_ali_redirect', now.toString());
                  window.location.replace(response.affiliateUrl);
                }
              }
            } catch (e) { /* ignore */ }
          }
        }
      );
    }, 3000);
  }
};

console.log("SoldSnap: AliExpress Script Loaded");
initAliExpressExtension();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "getProductData") {
    const isSearch = !window.location.href.includes('/item/');
    if (isSearch) {
      sendResponse({ isSearchPage: true });
    } else {
      extractAliExpressData().then(data => {
        sendResponse(data);
      });
    }
    return true;
  }
  return true;
});