import { debounce } from '../utils/performance';

const extractAmazonData = () => {
  const fullBodyText = document.body.innerText;
  const normalizedText = fullBodyText.replace(/\s+/g, ' ');

  const cleanImageUrl = (src: string): string => {
    if (!src) return '';
    return src
      .replace(/\._[A-Z]{2}[^.]*_\./g, '.')
      .replace(/\._[A-Z][0-9]+[^.]*_\./g, '.')
      .replace(/\._(.*?)_\./g, '.')
      .replace(/\.{2,}/g, '.'); // Remove double dots
  };

  const isImageActive = (img: HTMLImageElement): boolean => {
    try {
      if (img.id === 'landingImage') return true;
      let parent: HTMLElement | null = img.parentElement;
      let depth = 0;
      while (parent && parent !== document.body && depth < 3) {
        const style = parent.getAttribute('style') || '';
        if (/display\s*:\s*none/i.test(style)) return false;
        parent = parent.parentElement;
        depth++;
      }
      return true;
    } catch (e) {
      return true;
    }
  };

  const images: string[] = [];

  // Try to find the altImages container first (this contains only the active variant's gallery thumbnails)
  const altImagesContainer = document.getElementById('altImages');

  let imgElements: Element[] = [];
  if (altImagesContainer) {
    // If the active gallery container exists, ONLY take images from it
    imgElements = Array.from(altImagesContainer.querySelectorAll('img'));

    // Also include the active main landing image
    const landingImg = document.getElementById('landingImage');
    if (landingImg) {
      imgElements.push(landingImg);
    }
  } else {
    // Fallback if no altImages container exists
    imgElements = Array.from(document.querySelectorAll(
      '#main-image-container img, #imgTagWrapperId img, #imageBlockThumbs img, .imageThumbnail img, #landingImage'
    ));
  }

  // Filter elements to only keep visible/active ones
  imgElements = imgElements.filter(el => {
    const result = isImageActive(el as HTMLImageElement);
    console.log('[IMG-FILTER]', (el as HTMLImageElement).src?.substring(0, 60), '→ active:', result);
    return result;
  });

  imgElements.forEach(el => {
    const img = el as HTMLImageElement;
    const imgSrc = img.src || '';

    // Skip swatch elements safely (without high-level #twister parent checks that block the gallery)
    const isSwatch = !!img.closest('.swatchSelector, .swatchElement, [id*="inline-twister-row"]');
    if (isSwatch) {
      console.log('[IMG-SKIP] Swatch skip:', imgSrc.substring(0, 50));
      return;
    }

    // Skip video thumbnails safely
    const isVideo = !!img.closest('.videoThumbnail, .play-button') ||
      imgSrc.toLowerCase().includes('play') ||
      imgSrc.toLowerCase().includes('video');
    if (isVideo) {
      console.log('[IMG-SKIP] Video skip:', imgSrc.substring(0, 50));
      return;
    }

    // Skip play buttons or small layout assets
    if (imgSrc.includes('play-button') || imgSrc.includes('video-play') || imgSrc.includes('spacer.gif')) {
      return;
    }

    let url = '';

    // Check various Amazon-specific attributes for higher resolution
    const dynamicData = img.getAttribute('data-a-dynamic-image');
    if (dynamicData) {
      try {
        const parsed = JSON.parse(dynamicData);
        const urls = Object.keys(parsed);
        url = urls[urls.length - 1];
        console.log('[IMG-URL] dynamicData:', url.substring(0, 50));
      } catch (e) {
        console.log('[IMG-URL] dynamicData error:', e);
      }
    }

    if (!url) {
      url = img.getAttribute('data-old-hires') || imgSrc;
      console.log('[IMG-URL] fallback:', url?.substring(0, 50));
    }

    if (url && url.startsWith('http')) {
      const cleaned = cleanImageUrl(url);
      console.log('[IMG-URL] cleaned:', cleaned.substring(0, 50));

      // Filter out Amazon UI icons, rating stars, flags, logo assets, and clear spacers
      const isDesignAsset = cleaned.includes('/images/G/') ||
        cleaned.includes('transparent-pixel') ||
        cleaned.includes('spacer.gif') ||
        cleaned.includes('pixel.gif');

      if (!isDesignAsset) {
        images.push(cleaned);
      } else {
        console.log('[IMG-SKIP] Design asset:', cleaned.substring(0, 50));
      }
    } else {
      console.log('[IMG-SKIP] No URL or not HTTP:', url?.substring(0, 50));
    }
  });

  // Fallback: If no images were found in the DOM, extract from page scripts (colorImages / ImageBlock)
  if (images.length === 0 && !altImagesContainer) {
    try {
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        if (content.includes('colorImages') && (content.includes('initial') || content.includes('ImageBlock'))) {
          // Match all hiRes or large URLs
          const regex = /"(?:hiRes|large)"\s*:\s*"([^"]+)"/g;
          let m;
          while ((m = regex.exec(content)) !== null) {
            const url = m[1];
            if (url && url.startsWith('http')) {
              const cleaned = cleanImageUrl(url);
              if (!cleaned.includes('/images/G/') && !cleaned.includes('transparent-pixel')) {
                images.push(cleaned);
              }
            }
          }
        }
      });
    } catch (e) {
      console.warn('Fallback script image parsing failed:', e);
    }
  }

  const getAmazonImageId = (url: string): string => {
    const match = url.match(/\/images\/I\/([^._]+)/i); // ← sirf base ID, koi suffix nahi
    return match ? match[1] : url;
  };

  // Dedup based on Image ID
  const uniqueImages: string[] = [];

  // Pehle saare URLs ko image ID ke basis pe group karo
  // Phir har group se SIRF sabse lamba URL lo (highest res)
  const groupedByImageId = new Map<string, string[]>();

  images
    .filter(src => src && !src.includes('base64'))
    .forEach(url => {
      const imageId = getAmazonImageId(url);
      if (!groupedByImageId.has(imageId)) {
        groupedByImageId.set(imageId, []);
      }
      groupedByImageId.get(imageId)!.push(url);
    });

  groupedByImageId.forEach((urls) => {
    // Sabse lamba URL = highest resolution (Amazon ka pattern)
    const best = urls.sort((a, b) => b.length - a.length)[0];
    uniqueImages.push(best);
  });

  console.log('[DEBUG-EXTRACT] Final unique product images:', uniqueImages.length, uniqueImages);

  const title =
    (document.getElementById('productTitle') as HTMLElement)?.innerText.trim() ||
    (document.querySelector('meta[name="title"]') as HTMLMetaElement)?.content ||
    'Title not found';

  const asinInput = document.getElementById('ASIN') as HTMLInputElement;
  let asin = asinInput?.value;
  if (!asin) {
    const m = window.location.href.match(
      /\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i
    );
    if (m) asin = m[1];
  }
  if (!asin) {
    const m = fullBodyText.match(/ASIN[:\s]+([A-Z0-9]{10})/i);
    if (m) asin = m[1];
  }

  const mainPriceContainer =
    document.querySelector('#centerCol') ||
    document.querySelector('#rightCol') ||
    document.querySelector('#olp_feature_div') ||
    document.body;

  // ─── Helpers to clean duplicate prices and skip unit prices ───────────────
  const isUnitPrice = (text: string): boolean => {
    const lower = text.toLowerCase();
    return lower.includes('/') ||
      lower.includes('per') ||
      lower.includes('count') ||
      lower.includes('pack') ||
      lower.includes('oz') ||
      lower.includes('gram');
  };

  const cleanPriceText = (text: string): string => {
    let cleaned = text.trim();
    const matches = cleaned.match(/((?:A\$|AU\$|£|\$|€|Rs\.?|PKR|INR)\s*[\d,]+(?:\.\d{1,2})?)/gi);
    if (matches && matches.length >= 2 && matches[0] === matches[1]) {
      return matches[0];
    }
    if (matches && matches.length > 0) {
      return matches[0];
    }
    return cleaned;
  };

  let price = 'Price not found';

  // ─── Currency regex — covers US, UK, AU, CA, EU, IN, PK ─────────────────
  const currencyRegex = /[\$£€]|A\$|AU\$|\bPKR\b|\bRs\.?|\bINR\b|\bUSD\b|\bAUD\b|\bGBP\b|\bCAD\b/i;

  const priceSelectors = [
    // Variation / Swatch selected prices (highest priority for multi-option products)
    '#twister-plus-price-inline-value',
    '#twister-plus-price-inline-value .a-offscreen',
    '.swatchElement.selected .a-price .a-offscreen',
    '.a-button-selected .a-price .a-offscreen',
    '.a-button-selected .a-color-base',
    '.swatchElement.selected .a-color-price',

    // Most reliable — apex price (works on UK, AU, US)
    '.apexPriceToPay .a-offscreen',

    // Desktop core price blocks
    '#corePriceDisplay_desktop_feature_div .a-price:not([data-a-strike]) .a-offscreen',
    '#corePrice_desktop .a-price:not([data-a-strike]) .a-offscreen',
    '#corePrice_feature_div .a-price:not([data-a-strike]) .a-offscreen',
    '#unifiedPrice_feature_div .a-price:not([data-a-strike]) .a-offscreen',

    // Buybox
    '#price_inside_buybox',
    '#newBuyBoxPrice',
    '#buybox .a-price:not([data-a-strike]) .a-offscreen',
    '#buyNewSection .a-color-price',

    // Kindle / digital
    '#kindle-price',

    // Third-party total price
    '#tp_price_block_total_price_ww .a-offscreen',

    // Fallbacks
    '.a-price:not(.a-text-price):not([data-a-strike]) .a-offscreen',
    '.a-price-whole',
    '.olp-padding-right .a-color-price',
  ];

  for (const sel of priceSelectors) {
    const el = (mainPriceContainer || document).querySelector(sel);
    const text = el?.textContent?.trim();
    if (text && currencyRegex.test(text) && !isUnitPrice(text) && text.length < 25) {
      price = cleanPriceText(text);
      break;
    }
  }

  // Variant/swatch selected price fallback
  if (price === 'Price not found') {
    const variantPrice = document.querySelector(
      '.a-button-selected .a-color-base, [class*="twister"] .a-price .a-offscreen, .swatchElement.selected .a-color-price'
    );
    const variantText = variantPrice?.textContent?.trim();
    if (variantText && !isUnitPrice(variantText)) {
      price = cleanPriceText(variantText);
    }
  }

  // Body text fallback — handles £, $, A$, AU$, €, Rs with word boundaries
  if (price === 'Price not found') {
    const currencyPattern =
      /(?:A\$|AU\$|£|\$|€|\bRs\.?\s*)[\d,]+(?:\.\d{1,2})?/i;
    const bodyPriceMatch =
      normalizedText.match(
        new RegExp(`from\\s+(${currencyPattern.source})`, 'i')
      ) ||
      normalizedText.match(
        new RegExp(
          `\\d+\\s+option[s]?\\s+from\\s+(${currencyPattern.source})`,
          'i'
        )
      ) ||
      normalizedText.match(currencyPattern);

    if (bodyPriceMatch) {
      const matched =
        bodyPriceMatch[bodyPriceMatch.length - 1] || bodyPriceMatch[0];
      if (matched && currencyPattern.test(matched) && !isUnitPrice(matched)) {
        price = cleanPriceText(matched);
      }
    }
  }

  // "See Buying Options" fallback
  if (price === 'Price not found') {
    if (
      fullBodyText.includes('See All Buying Options') ||
      fullBodyText.includes('No featured offers available')
    ) {
      price = 'See Buying Options';
    }
  }

  // ─── Original / was-price ────────────────────────────────────────────────
  let originalPrice = '';
  const origSelectors = [
    '.a-price.a-text-price .a-offscreen',
    '#listPrice',
    '#priceblock_wasprice',
    '.basisPrice .a-offscreen',
    '[data-a-strike="true"] .a-offscreen',
  ];
  for (const sel of origSelectors) {
    const el = (mainPriceContainer || document).querySelector(sel);
    const text = el?.textContent?.trim();
    if (text && currencyRegex.test(text) && !isUnitPrice(text)) {
      originalPrice = cleanPriceText(text);
      break;
    }
  }

  // ─── Best Sellers Rank ───────────────────────────────────────────────────
  let rank = 'N/A';

  const performRankExtraction = () => {
    // 1. Try specific elements and tables (very common in UK/AU)
    const selectors = [
      '#SalesRank', '#detailBullets_feature_div', '.prodDetTable',
      '#productDetails_db_sections', '#productDetails_techSpec_section_1',
      '.attrG', '#item_details_content', '#technical-data',
      '#productDetails_techSpec_section_2', '.additional-details'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) {
        const text = el.innerText.replace(/\s+/g, ' ');
        const m = text.match(/(?:Best\s*Sellers?\s*Rank|Bestsellers?\s*Rank|BSR|Amazon\s*Bestsellers?\s*Rank|Ranked)[\s:#]*(#?[0-9,]+)\s+in\s+([^(\n\r\t]{3,100}?)(?=\s*(?:#[0-9,]|\(|$))/i);
        if (m) {
          rank = `${m[1].trim()} in ${m[2].trim().split(/\s{2,}/)[0].trimEnd()}`;
          return true;
        }
      }
    }

    // 2. Scan ALL tables on the page (brute force for localized layouts)
    const allTables = document.querySelectorAll('table');
    for (const table of Array.from(allTables)) {
      const text = (table as HTMLElement).innerText.replace(/\s+/g, ' ');
      if (text.toLowerCase().includes('rank')) {
        const m = text.match(/(?:Best\s*Sellers?\s*Rank|Bestsellers?\s*Rank|BSR|Ranked)[\s:#]*(#?[0-9,]+)\s+in\s+([^(\n\r\t]{3,100}?)(?=\s*(?:#[0-9,]|\(|$))/i);
        if (m) {
          rank = `${m[1].trim()} in ${m[2].trim().split(/\s{2,}/)[0].trimEnd()}`;
          return true;
        }
      }
    }

    // 3. Fallback to body text with broader category support
    const bodyText = document.body.innerText.replace(/\s+/g, ' ');
    const rankMatch = bodyText.match(
      /(?:Best\s*Sellers?\s*Rank|Bestsellers?\s*Rank|Bestseller-Rang|BSR|Amazon\s*Bestsellers?\s*Rank|Ranked)[\s:#]*(#?[0-9,]+)\s+in\s+([^(\n\r\t]{3,100}?)(?=\s*(?:#[0-9,]|\(|$))/i
    );

    if (rankMatch) {
      const cat = rankMatch[2].trim().split(/\s{2,}/)[0].trimEnd();
      rank = `${rankMatch[1].trim()} in ${cat}`;
      return true;
    }

    // 4. Final simple pattern fallback
    const altRankMatch = bodyText.match(
      /(#[0-9,]+)\s+in\s+([\w\s&,''.-]+?(?:Electronics|Books|Kitchen|Sports|Toys|Beauty|Health|Garden|Automotive|Tools|Home|Baby|Music|Computers|Clothing|Office|Grocery|Pet|Stationery|DIY|Lighting|Musical|Jewellery|Shoes|Watches|Video Games|Handmade|Mobile|Wireless|Power|Battery|Accessories|Lighting|Luggage|Apparel|Software)[^(\n\r\t]{0,50}?)(?=\s*(?:#[0-9,]|\(|$))/i
    );
    if (altRankMatch) {
      const cat = altRankMatch[2].trim().split(/\s{2,}/)[0].trimEnd();
      rank = `${altRankMatch[1].trim()} in ${cat}`;
      return true;
    }

    return false;
  };

  performRankExtraction();

  // Handle Dynamic/Lazy Loading for Rank
  if (rank === 'N/A') {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (performRankExtraction() || attempts > 20) {
        clearInterval(interval);
        const rankVal = document.querySelector('.grab-overlay-rank-val');
        if (rankVal && rank !== 'N/A') rankVal.textContent = rank;
      }
    }, 1000);
  }

  // ─── Seller ──────────────────────────────────────────────────────────────
  let seller = 'Seller not found';
  const sellerSelectors = [
    '#sellerProfileTriggerId',
    '#merchant-info a',
    '#tabular-buybox-seller span',
    '#buybox-tabular-container .a-span9',
    '#merchant-info',
    '#bylineInfo',
    '#brand',
    '.po-brand .po-break-word',
  ];

  for (const sel of sellerSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    const text = el?.innerText?.trim();
    if (text && text.length > 1 && !text.includes('Sign in')) {
      seller = text
        .replace(/Dispatched from and sold by\s+/i, '')
        .replace(/Sold by\s+/i, '')
        .replace(/Visit the\s+/i, '')
        .replace(/\s+Store\s*,?\s*/gi, ' ')
        .replace(/,\s*/g, '')
        .split(/[\n\t]/)[0]
        .trim();
      break;
    }
  }

  if (seller === 'Seller not found' || seller === '') {
    const bylineEl = document.querySelector('#bylineInfo') as HTMLElement;
    if (bylineEl) {
      const raw = bylineEl.innerText || '';
      const m =
        raw.match(/Visit the\s+(.+?)\s+Store/i) ||
        raw.match(/Brand:\s*(.+)/i);
      if (m) seller = m[1].trim();
    }
  }

  if (seller === 'Seller not found' || seller === '') {
    const m =
      fullBodyText.match(
        /Sold\s+by[:\s]+([A-Z][a-zA-Z0-9\s,&.]{2,40})/i
      ) ||
      fullBodyText.match(
        /Dispatched\s+from\s+and\s+sold\s+by\s+([A-Z][a-zA-Z0-9\s,&.]{2,40})/i
      );
    if (m) seller = m[1].trim().split('\n')[0];
  }

  if (
    fullBodyText.includes('Dispatched from and sold by Amazon') ||
    fullBodyText.includes('Ships from and sold by Amazon') ||
    fullBodyText.includes('Sold by Amazon')
  ) {
    seller = 'Amazon';
  }

  if (seller.toLowerCase().includes('amazon')) seller = 'Amazon';

  // ─── Quantity / Stock ────────────────────────────────────────────────────
  let qty = 'In Stock';
  const qtySelect = document.getElementById('quantity') as HTMLSelectElement;
  if (qtySelect && qtySelect.options && qtySelect.options.length > 0) {
    qty = qtySelect.options[qtySelect.options.length - 1].value + '+';
  } else {
    const availEl = document.querySelector('#availability') as HTMLElement;
    const availText = availEl?.innerText || fullBodyText;
    const qtyMatch = availText.match(/Only\s+(\d+)\s+left/i);
    if (qtyMatch) qty = qtyMatch[1];
    else if (
      availText.match(/out\s+of\s+stock|unavailable|cannot be dispatched/i)
    )
      qty = '0 (Out of stock)';
  }

  // ─── Prime / FBA ─────────────────────────────────────────────────────────
  const isPrime = !!document.querySelector(
    'i.a-icon-prime, span.a-icon-prime'
  );
  const isFBA =
    fullBodyText.includes('Fulfilled by Amazon') ||
    fullBodyText.includes('Ships from Amazon');
  const primeStatus = isPrime || isFBA ? 'Prime / FBA' : 'Merchant';

  // ─── Sold count ──────────────────────────────────────────────────────────
  const soldEl = document.querySelector(
    '#social-proofing-faceout-title-tk_bought span, [data-csa-c-content-id="social-proofing-faceout-title-tk_bought"] span'
  );
  const soldCount = soldEl?.textContent?.trim() || 'N/A on Amazon';

  // ─── Shipping ────────────────────────────────────────────────────────────
  let shipping = 'N/A';
  const shippingSelectors = [
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE',
    '#deliveryBlockMessage',
    '#deliveryMessage_feature_div',
    '#ddmDeliveryMessage',
    '#amazonGlobal_feature_div',
    '#price-shipping-message',
    '.mir-primary-delivery-message',
    '#shipping-message'
  ];
  for (const sel of shippingSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    if (el?.innerText?.trim()) {
      const text = el.innerText.trim();
      if (text.toLowerCase().includes('free')) {
        shipping = 'FREE';
        break;
      } else {
        const m = text.match(/((?:A\$|AU\$|£|\$|€)[0-9,.]+)\s+(?:delivery|shipping)/i);
        if (m) { shipping = m[1]; break; }
      }
    }
  }

  if (shipping === 'N/A') {
    if (fullBodyText.match(/FREE\s+(?:delivery|shipping)/i)) {
      shipping = 'FREE';
    } else {
      const shipMatch = fullBodyText.match(/(?:£|\$|€|A\$|AU\$)[\d,.]+\s+(?:delivery|shipping)/i);
      if (shipMatch) shipping = shipMatch[0].replace(/\s+(?:delivery|shipping)/i, '').trim();
    }
  }

  // ─── Estimated delivery ──────────────────────────────────────────────────
  let delivery = 'N/A';
  const delSelectors = [
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE .a-text-bold',
    '#deliveryBlockMessage .a-text-bold',
    '.mir-next-day-delivery__message',
    '#fast-track-message',
    '#deliveryMessage_feature_div span.a-text-bold',
    '.amazon-delivery-message'
  ];

  for (const sel of delSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    if (el?.innerText?.trim()) {
      delivery = el.innerText.trim();
      break;
    }
  }

  if (delivery === 'N/A') {
    const delMatch = fullBodyText.match(/(?:Get it by|Arrives|Arriving|Delivery by)[:\s]+([A-Z][a-z]+,?\s+\d+\s+[A-Z][a-z]+)/i)
      || fullBodyText.match(/(?:Get it by|Arrives|Arriving|Delivery by)[:\s]+([A-Z][a-z]+,?\s+[A-Z][a-z]+\s+\d+)/i)
      || fullBodyText.match(/(?:Get it by|Arrives|Arriving|Delivery by)[:\s]+(\d+\s+[A-Z][a-z]+)/i)
      || fullBodyText.match(/(?:Get it by|Arrives|Arriving|Delivery by)[:\s]+([A-Z][a-z]+\s+\d+)/i);

    if (delMatch) delivery = delMatch[1] || delMatch[0];
  }

  // ─── Rating ──────────────────────────────────────────────────────────────
  let rating = 'N/A';
  const acrPopover = document.querySelector('#acrPopover') as HTMLElement;
  const acrTitle =
    acrPopover?.getAttribute('title') ||
    acrPopover?.getAttribute('aria-label');
  if (acrTitle && /[\d.]+\s+out\s+of/i.test(acrTitle)) {
    rating = acrTitle.trim();
  }

  if (rating === 'N/A') {
    const ratEl =
      document.querySelector(
        '#centerCol #acrPopover .a-size-base'
      ) ||
      document.querySelector(
        '#averageCustomerReviews .a-icon-alt'
      ) ||
      document.querySelector('[data-hook="rating-out-of-text"]') ||
      document.querySelector('.a-icon-star .a-icon-alt') ||
      document.querySelector('#acrPopover span.a-icon-alt');
    if (ratEl?.textContent) rating = ratEl.textContent.trim();
  }

  if (rating !== 'N/A') {
    const revEl = document.querySelector('#acrCustomerReviewText');
    if (revEl) rating += ` (${revEl.textContent?.trim()})`;
  }

  return {
    title,
    price,
    originalPrice,
    prime: primeStatus,
    qty,
    images: uniqueImages,
    seller,
    soldCount,
    asin: asin || 'N/A',
    rank,
    shipping,
    delivery,
    rating,
    url: window.location.href,
  };
};

import { mountOverlay, mountSearchCard } from './mount';

const buildAmazonAffiliateUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();
    const domains = [
      'amazon.com.au',
      'amazon.co.uk',
      'amazon.com',
      'amazon.ca',
      'amazon.de',
      'amazon.fr',
      'amazon.it',
      'amazon.es',
      'amazon.in',
      'amazon.com.mx',
      'amazon.com.br',
    ];
    const matchedDomain = domains.find(d => host.includes(d));
    if (!matchedDomain) return null;
    const tags: Record<string, string> = {
      'amazon.com': 'alex3210b-20',
      'amazon.co.uk': 'deluxmerge212-21',
      'amazon.com.au': 'asds0d-22',
      'amazon.ca': 'alex3210b-20',
      'amazon.de': 'alex3210b-20',
      'amazon.fr': 'alex3210b-20',
      'amazon.it': 'alex3210b-20',
      'amazon.es': 'alex3210b-20',
      'amazon.in': 'alex3210b-20',
    };
    const tag = tags[matchedDomain] || 'alex3210b-20';
    const asinMatch = url.match(
      /\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i
    );
    if (!asinMatch) return null;
    return `https://www.${matchedDomain}/dp/${asinMatch[1]}?tag=${tag}`;
  } catch {
    return null;
  }
};

const initExtension = () => {
  const url = window.location.href;
  const isProductPage =
    /\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i.test(url);
  const isSearch =
    !isProductPage &&
    (url.includes('/s?') ||
      url.includes('/s/') ||
      url.includes('keywords=') ||
      url.includes('&k=') ||
      !!document.querySelector('.s-main-slot') ||
      !!document.querySelector(
        '[data-component-type="s-search-results"]'
      ));

  if (isSearch) {
    const processSearchCards = () => {
      const searchSlot =
        document.querySelector('.s-main-slot') ||
        document.querySelector(
          '[data-component-type="s-search-results"]'
        ) ||
        document.querySelector('.s-search-results') ||
        document.body;

      const cardContainers = searchSlot.querySelectorAll(
        '.s-result-item[data-asin], [data-component-type="s-search-result"]'
      );

      cardContainers.forEach(cardEl => {
        const card = cardEl as HTMLElement;
        const asin = card.getAttribute('data-asin');
        if (!asin || asin.length !== 10) return;

        if (card.querySelector(`.grab-search-mount[data-asin="${asin}"]`))
          return;

        const titleEl = card.querySelector('h2 a span, h2 span, h2');
        const title = titleEl?.textContent?.trim() || 'Amazon Product';

        const isPrime =
          !!card.querySelector('i.a-icon-prime') ||
          !!card.querySelector('.a-icon-prime');

        const price =
          card
            .querySelector('.a-price .a-offscreen')
            ?.textContent?.trim() ||
          card.querySelector('.a-color-price')?.textContent?.trim() ||
          'N/A';

        // ─── Stock ───────────────────────────────────────────────────────
        let stock: string | null = null;
        const cardText = card.innerText || '';
        const onlyLeft = cardText.match(/only\s+(\d+)\s+left/i);
        if (onlyLeft) {
          stock = onlyLeft[1];
        } else if (/currently unavailable/i.test(cardText)) {
          stock = '0';
        }

        // ─── Rank (search cards rarely show rank — usually N/A) ──────────
        let rank = 'N/A';
        const cardNorm = cardText.replace(/\s+/g, ' ');
        const rankPatterns = [
          /#[\d,]+\s+in\s+[^\n]{1,50}/i,
          /([0-9,]+)\s+in\s+(?:Electronics|Books|Kitchen|Sports|Toys|Beauty|Health|Garden|Tools|Home|Baby|Music|Automotive|Clothing|Office|Grocery|Pet|Stationery|DIY|Lighting|Musical|Jewellery|Shoes|Watches)[^\n]{0,30}/i,
        ];
        for (const p of rankPatterns) {
          const m = cardNorm.match(p);
          if (m) {
            rank = m[0].trim();
            break;
          }
        }

        // ─── Seller ──────────────────────────────────────────────────────
        const sellerEl =
          card.querySelector('.a-size-small .a-color-secondary') ||
          card.querySelector(
            '[data-component-type="s-seller-info"]'
          );
        const seller = sellerEl?.textContent?.trim() || 'N/A';

        // ─── Social Proof (Bought in past month) ──────────────────────────
        let boughtCount = 'N/A';
        const boughtMatch = cardText.match(/([\d,+]+\s+bought\s+in\s+past\s+month)/i);
        if (boughtMatch) {
          boughtCount = boughtMatch[1];
        }

        const productTitleEl =
          card.querySelector('h2') ||
          card.querySelector('.a-size-mini') ||
          card.querySelector(
            '.a-link-normal.s-underline-text'
          );

        const infoCol =
          card.querySelector('.puis-list-col-right') ||
          card.querySelector('.sg-col-inner') ||
          card;

        const mountPoint =
          productTitleEl?.closest('.a-section') ||
          productTitleEl?.parentElement ||
          infoCol;

        if (!mountPoint) return;

        mountSearchCard(asin, title, mountPoint, {
          price,
          prime: isPrime,
          stock,
          seller,
          rank,
          boughtCount
        });
      });
    };

    const updateLinks = () => {
      const links = document.querySelectorAll<HTMLAnchorElement>(
        'a[href]:not([data-grab-tagged])'
      );
      links.forEach(anchor => {
        const syncUrl = buildAmazonAffiliateUrl(anchor.href);
        if (syncUrl && syncUrl !== anchor.href) {
          anchor.setAttribute('data-grab-tagged', 'true');
          anchor.href = syncUrl;
        }
      });
    };

    const combinedTask = () => {
      processSearchCards();
      updateLinks();
    };

    const debouncedTask = debounce(combinedTask, 500);
    const observer = new MutationObserver(() => {
      debouncedTask();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    combinedTask();

    document.addEventListener(
      'click',
      e => {
        const anchor = (e.target as HTMLElement).closest?.(
          'a[href]'
        ) as HTMLAnchorElement | null;
        if (!anchor) return;
        const syncUrl = buildAmazonAffiliateUrl(anchor.href);
        if (syncUrl && syncUrl !== anchor.href) {
          anchor.href = syncUrl;
        }
      },
      true
    );
  } else {
    const runProductPage = () => {
      // Expose fresh image extractor on window for Overlay's download button
      (window as any).extractFreshImages = () => {
        const freshData = extractAmazonData();
        return freshData.images;
      };

      const data = extractAmazonData();
      mountOverlay(data, 'body', true);
      const fastUrl = buildAmazonAffiliateUrl(window.location.href);
      if (fastUrl && fastUrl !== window.location.href)
        window.history.replaceState(null, '', fastUrl);
    };
    runProductPage();
    setTimeout(runProductPage, 1500);

    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(runProductPage, 500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }
};

initExtension();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getProductData') {
    const url = window.location.href;
    const isProductPage =
      /\/(?:dp|product|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i.test(url);
    const isSearch =
      !isProductPage &&
      (url.includes('/s?') || url.includes('/s/') || url.includes('keywords=') || url.includes('&k=') ||
        !!document.querySelector('.s-main-slot') || !!document.querySelector('[data-component-type="s-search-results"]'));

    if (isSearch) {
      sendResponse({ isSearchPage: true });
    } else {
      sendResponse(extractAmazonData());
    }
  }
  return true;
});