

const extractEbayData = () => {
  const title = (document.querySelector('h1.x-item-title__mainTitle span') as HTMLElement)?.innerText.trim()
    || (document.querySelector('h1.x-item-title__mainTitle') as HTMLElement)?.innerText.trim()
    || (document.querySelector('h1.vi-is1-titleH1') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.vi-atf-main-ar-title h1') as HTMLElement)?.innerText.trim()
    || (document.querySelector('h1') as HTMLElement)?.innerText.trim()
    || document.title.replace(/\s*\|\s*eBay\s*$/i, '').trim()
    || "Title not found";

  let priceEl = document.querySelector('.x-price-primary span[itemprop="price"], .x-price-primary, .vi-is1-prcp, .msku-price') as HTMLElement;
  let price = priceEl?.innerText.trim() || "Price not found";
  if (price.includes('or Best Offer')) price = price.split('or Best Offer')[0].trim();

  // Original price (before discount)
  const originalPrice = (document.querySelector('.x-additional-info .ux-textspans--STRIKETHROUGH, .x-price-approx__price') as HTMLElement)?.innerText.trim() || "";

  // Images - high-res from carousel and thumbnails
  const imgSet = new Set<string>();
  const imgElements = document.querySelectorAll('.ux-image-carousel-item img, .ux-image-filmstrip-item img, .ux-image-magnify__image--zoom');

  imgElements.forEach(el => {
    let src = (el as HTMLImageElement).src || (el as HTMLImageElement).getAttribute('data-src') || (el as HTMLImageElement).getAttribute('data-zoom-src');
    if (src && !src.includes('base64')) {
      // eBay high-res conversion: s-l64 -> s-l1600, s-l500 -> s-l1600, etc.
      const highRes = src.replace(/s-l\d+\.(jpg|png|webp|jpeg)/i, 's-l1600.$1');
      imgSet.add(highRes);
    }
  });

  const images = [...imgSet];

  // Seller info
  let seller = "Seller not found";
  const sellerSelectors = [
    '[data-testid="seller-card-name"]',
    '.x-sellercard-atf__seller-name',
    'a[href*="/usr/"]',
    '.x-sellercard-atf__info-item-wrapper',
    '.seller-persona .mbg-id',
    '.x-sellercard-atf__info-item span'
  ];

  for (const selector of sellerSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent?.trim()) {
      seller = el.textContent.trim();
      break;
    }
  }

  // Brute force seller fallback
  if (seller === "Seller not found") {
    const allLinks = Array.from(document.querySelectorAll('a'));
    const usrLink = allLinks.find(a => a.href.includes('/usr/') || a.href.includes('ebay.com/usr/'));
    if (usrLink) {
      seller = usrLink.textContent?.trim() || "Seller not found";
    }
    if (seller === "Seller not found") {
      // Look for text near "About this seller"
      const pageText = document.body.innerText;
      const aboutMatch = pageText.match(/About\s+this\s+seller\s*\n\s*\n\s*([^\n]+)/i)
        || pageText.match(/Seller\s*information\s*\n\s*\n\s*([^\n]+)/i)
        || pageText.match(/([^\n]+)\s*\n\s*\(\d+\)\s*\n\s*\d+(?:\.\d+)?%\s*positive/i);
      if (aboutMatch) seller = aboutMatch[1].trim();
    }
  }

  // Extract Brand
  let brand = "";
  const brandLabels = document.querySelectorAll('.ux-labels-values__labels, .itemAttr td');
  for (const el of Array.from(brandLabels)) {
    if (el.textContent?.trim().toLowerCase().includes('brand')) {
      const valEl = el.nextElementSibling || (el.parentElement?.querySelector('.ux-labels-values__values'));
      if (valEl) {
        brand = valEl.textContent?.trim() || "";
        break;
      }
    }
  }
  if (!brand) {
    const pageText = document.body.innerText;
    const brandMatch = pageText.match(/\n\s*Brand\s*\n\s*([^\n]+)/i);
    if (brandMatch) brand = brandMatch[1].trim();
  }

  // Shipping & Delivery
  let shipping = (document.querySelector('.ux-labels-values--shipping .ux-textspans--BOLD') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.ux-labels-values--shipping') as HTMLElement)?.innerText.trim()
    || "N/A";

  if (shipping.includes('Located in:')) {
    shipping = shipping.split('Located in:')[0].trim();
  }

  let delivery = (document.querySelector('.ux-labels-values--delivery .ux-textspans--SECONDARY') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.ux-labels-values--delivery .ux-textspans--BOLD') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.ux-labels-values--delivery') as HTMLElement)?.innerText.trim()
    || "N/A";

  // Brute force delivery fallback
  if (delivery === "N/A") {
    const pageText = document.body.innerText;
    const deliveryMatch = pageText.match(/Delivery:\s*\n\s*([^\n]+)/i)
      || pageText.match(/(?:delivery|Estimated by|delivered by)\s*(?:on|by|between)?\s*([A-Z][a-z]{2,8},?\s*[A-Z][a-z]{2,8}\s*\d+(?:\s*-\s*[^\n,]+)?)/i)
      || pageText.match(/(?:delivery|Estimated by)\s*between\s*([^\n.]+)/i)
      || pageText.match(/Est\.\s*delivery\s*([^\n,]+)/i);
    if (deliveryMatch) delivery = deliveryMatch[1].trim();
  }

  // Rating
  let rating = (document.querySelector('.x-sellercard-atf__info-item--feedback-rating') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.x-sellercard-atf__info-item-wrapper') as HTMLElement)?.innerText.trim()
    || (document.querySelector('.seller-persona') as HTMLElement)?.innerText.trim()
    || "N/A";

  // Brute force rating fallback
  if (rating === "N/A") {
    const pageText = document.body.innerText;
    const ratingMatch = pageText.match(/(\d+(?:\.\d+)?%\s*positive feedback)/i)
      || pageText.match(/(\d+(?:\.\d+)?%\s*positive)/i);
    if (ratingMatch) rating = ratingMatch[1];
  }

  // Sold count / availability
  let soldCount = "N/A";
  const soldSelectors = ['.x-quantity__availability', '.d-quantity__count', '.vi-qty-pur-lnk', '.x-quantity-lbt'];
  for (const sel of soldSelectors) {
    const el = document.querySelector(sel) as HTMLElement;
    if (el && el.innerText.match(/[\d,+]+\s+sold/i)) {
      soldCount = el.innerText.match(/([\d,+]+\s+sold)/i)?.[1] || "N/A";
      if (soldCount !== "N/A") break;
    }
  }
  if (soldCount === "N/A") {
    const qtySection = document.querySelector('.x-quantity__choose, .ux-layout-section--quantity');
    if (qtySection) {
      const m = (qtySection as HTMLElement).innerText.match(/([\d,+]+\s+sold)/i);
      if (m) soldCount = m[1];
    }
  }

  // Final brute force fallback for soldCount - ONLY NUMBERS
  if (soldCount === "N/A") {
    const pageText = document.body.innerText.replace(/\s+/g, ' ');
    const m = pageText.match(/([\d,+]+\s+sold\s+in\s+last\s+\d+\s+hours)/i)
      || pageText.match(/([\d,+]+\s+sold)/i);
    if (m) soldCount = m[1];
  }

  // Item ID (eBay equivalent of ASIN)
  const asinMatch = window.location.href.match(/\/itm\/(?:[^\/]+\/)?(\d+)/);
  let asin = asinMatch ? asinMatch[1] : null;
  if (!asin) {
    const epIdMatch = document.body.innerText.match(/eBay Product ID \(ePID\)\s*(\d+)/i);
    if (epIdMatch) asin = epIdMatch[1];
  }
  asin = asin || (document.querySelector('.ux-layout-section--item-number .ux-textspans') as HTMLElement)?.innerText.trim() || "N/A";

  // Category / Rank
  const categoryEl = document.querySelector('.seo-breadcrumb-text') as HTMLElement;
  const rank = categoryEl?.innerText.trim() || "N/A";

  // Qty available
  let qty = "Unknown";
  const qtySelectors = [
    '.x-quantity__choose select',
    '.x-quantity__availability',
    '.d-quantity__count',
    '[class*="quantity-count"]'
  ];

  for (const sel of qtySelectors) {
    const el = document.querySelector(sel);
    if (el) {
      if (el instanceof HTMLSelectElement && el.options.length > 0) {
        qty = el.options[el.options.length - 1].value + "+";
        break;
      } else if (el.textContent?.trim()) {
        const txt = el.textContent.trim();
        const match = txt.match(/(\d+)\s+available/i) || txt.match(/(\d+)\s+left/i) || txt.match(/Quantity:\s*(\d+)/i);
        if (match) {
          qty = match[1];
          break;
        }
      }
    }
  }

  // Brute force qty fallback
  if (qty === "Unknown") {
    const pageText = document.body.innerText;
    const qtyMatch = pageText.match(/Quantity:\s*\n\s*(\d+)/i)
      || pageText.match(/(\d+)\s+available/i)
      || pageText.match(/(\d+)\s+left/i)
      || (pageText.match(/Last one/i) ? ["Last one", "1"] : null);
    if (qtyMatch) qty = qtyMatch[1];
  }

  return {
    title,
    price,
    originalPrice,
    images: [...new Set(images)],
    seller,
    shipping,
    delivery,
    rating,
    soldCount,
    asin,
    rank,
    qty,
    prime: "eBay Listing",
    brand,
    url: window.location.href
  };
};

import { mountOverlay, mountEbaySearchCard } from './mount';

import { debounce } from '../utils/performance';

const buildEbayAffiliateUrl = (href: string): string | null => {
  try {
    const url = new URL(href, window.location.origin);
    const host = url.hostname.toLowerCase();
    if (!host.includes('ebay.')) return null;

    // Don't re-tag if already tagged
    if (url.searchParams.has('campid')) return null;

    // Check if it's a product link (/itm/ or item=)
    const isProduct = href.includes('/itm/') || href.includes('item=');
    if (!isProduct) return null;

    // eBay Partner Network parameters
    url.searchParams.set('mkcid', '1');

    // Set appropriate mkrid based on domain
    let mkrid = '711-53200-19255-0'; // Default USA
    if (host.includes('.co.uk')) mkrid = '710-53481-19255-0';
    else if (host.includes('.com.au')) mkrid = '705-53470-19255-0';
    else if (host.includes('.ca')) mkrid = '706-53473-19255-0';
    else if (host.includes('.de')) mkrid = '707-53477-19255-0';
    else if (host.includes('.fr')) mkrid = '709-53476-19255-0';
    else if (host.includes('.it')) mkrid = '724-53478-19255-0';
    else if (host.includes('.es')) mkrid = '1185-53479-19255-0';

    url.searchParams.set('mkrid', mkrid);
    url.searchParams.set('campid', import.meta.env.VITE_EBAY_CAMP_ID || '5339108888');
    url.searchParams.set('toolid', '10001');
    url.searchParams.set('customid', 'soldsnap');
    url.searchParams.set('mkevt', '1');

    return url.toString();
  } catch { return null; }
};

const initEbayExtension = () => {
  // Shrink eBay search bar size
  const style = document.createElement('style');
  style.textContent = `
    #gh-ac-box { height: 32px !important; }
    #gh-ac { height: 30px !important; font-size: 14px !important; padding-top: 0 !important; padding-bottom: 0 !important; }
    #gh-btn { height: 32px !important; padding: 0 15px !important; line-height: 32px !important; }
    #gh-top { padding-top: 2px !important; padding-bottom: 2px !important; }
    #gh-cat-box { height: 32px !important; }
    #gh-cat { height: 32px !important; padding-top: 0 !important; padding-bottom: 0 !important; }
    #gh-f { margin-top: 5px !important; margin-bottom: 5px !important; }
  `;
  document.head.appendChild(style);

  // Skip history and account pages to avoid UI clutter
  if (
    window.location.href.includes('purchaseHistory') ||
    window.location.href.includes('SearchHistory') ||
    window.location.href.includes('/mye/')
  ) {
    return;
  }

  const isProductPage = window.location.href.includes('/itm/') || window.location.href.includes('/p/') || !!document.querySelector('.x-item-title__mainTitle, .vi-is1-titleH1');
  const isSearch = !isProductPage && (window.location.href.includes('/sch/') ||
    window.location.href.includes('/b/') ||
    !!document.querySelector('.srp-results, .s-item, #srp-river-results, .srp-river-main'));

  const sellerCache: Record<string, { seller: string; feedback: string; soldCount: string; watchers: string; brand: string }> = {};

  let activeEbayRequests = 0;
  const MAX_CONCURRENT_EBAY = 20; // Aggressive concurrency for instant results
  const ebayQueue: Array<() => void> = [];

  const enqueueEbay = (task: () => void) => {
    if (activeEbayRequests < MAX_CONCURRENT_EBAY) {
      activeEbayRequests++;
      task();
    } else {
      ebayQueue.push(task);
    }
  };

  const dequeueEbay = () => {
    activeEbayRequests--;
    if (ebayQueue.length > 0) {
      const next = ebayQueue.shift()!;
      activeEbayRequests++;
      next();
    }
  };

  const fetchEbaySeller = async (itemId: string): Promise<{ seller: string; feedback: string; soldCount: string; watchers: string; brand: string }> => {
    if (sellerCache[itemId]) return sellerCache[itemId];

    return new Promise((resolve) => {
      enqueueEbay(async () => {
        try {
          const domain = window.location.hostname.replace('www.', '');
          const response: any = await new Promise((resMsg) => {
            chrome.runtime.sendMessage(
              { action: 'fetchHtml', url: `https://www.${domain}/itm/${itemId}` },
              resMsg
            );
          });

          if (!response?.html) {
            resolve({ seller: "eBay Seller", feedback: "", soldCount: "N/A", watchers: "N/A", brand: "N/A" });
          } else {
            const html = response.html;
            let seller = "eBay Seller";
            let feedback = "";
            let soldCount = "N/A";
            let watchers = "N/A";

            const m = html.match(/data-testid="seller-card-name"[^>]*>([^<]+)</) ||
              html.match(/class="x-sellercard-atf__seller-name"[^>]*>([^<]+)</) ||
              html.match(/class="ux-textspans ux-textspans--BOLD"[^>]*>([^<]+)<\/span><\/a>\s*\(\d+\)/) ||
              html.match(/seller-info-item[^>]*>([^<]+)/) ||
              html.match(/seller-name[^>]*>([^<]+)/);

            if (m) seller = m[1].trim();

            if (seller === "eBay Seller") {
              const usrMatch = html.match(/href="[^"]*\/usr\/([^"?]+)"/);
              if (usrMatch) seller = decodeURIComponent(usrMatch[1]);
            }

            const fbMatch = html.match(/(\d+(?:\.\d+)?%)\s*positive/i);
            if (fbMatch) feedback = fbMatch[1] + " positive";

            const sMatch = html.match(/class="x-quantity__availability"[^>]*>([\d,+]+\s+sold)/i) ||
              html.match(/class="d-quantity__count"[^>]*>([\d,+]+\s+sold)/i) ||
              html.match(/class="vi-qty-pur-lnk"[^>]*>([\d,+]+\s+sold)/i) ||
              html.match(/([\d,+]+\s+sold)/i);
            if (sMatch) soldCount = sMatch[1];

            const wMatch = html.match(/([\d,]+)\s+watchers/i) || html.match(/([\d,]+)\s+watching/i);
            if (wMatch) watchers = wMatch[1];

            let brand = "N/A";
            const doc = new DOMParser().parseFromString(html, "text/html");
            const brandLabels = doc.querySelectorAll('.ux-labels-values__labels, .itemAttr td');
            for (const el of Array.from(brandLabels)) {
              if (el.textContent?.trim().toLowerCase().includes('brand')) {
                const valEl = el.nextElementSibling || (el.parentElement?.querySelector('.ux-labels-values__values'));
                if (valEl && valEl.textContent?.trim()) {
                  brand = valEl.textContent?.trim() || "N/A";
                  break;
                }
              }
            }
            if (brand === "N/A") {
              const brandMatch = html.match(/"Brand",[^\]]*"values":\["([^"]+)"/i)
                || html.match(/itemprop="brand"[^>]*>([^<]+)</i)
                || html.match(/Brand<\/span><\/div><div[^>]*><span[^>]*>([^<]+)<\/span>/i);
              if (brandMatch && brandMatch[1].trim()) brand = brandMatch[1].trim();
            }

            const result = { seller, feedback, soldCount, watchers, brand };
            sellerCache[itemId] = result;
            resolve(result);
          }
        } catch {
          resolve({ seller: "eBay Seller", feedback: "", soldCount: "N/A", watchers: "N/A", brand: "N/A" });
        } finally {
          dequeueEbay();
        }
      });
    });
  };

  if (isSearch) {
    const processSearchCards = () => {
      const allLinks = document.querySelectorAll('.srp-results a[href*="/itm/"], .s-item__link, .s-item a[href*="/itm/"]');

      allLinks.forEach(linkEl => {
        const link = linkEl as HTMLAnchorElement;
        const href = link.href;
        const match = href.match(/\/itm\/(\d+)/) || href.match(/item=(\d+)/);
        if (!match || !match[1]) return;
        const itemId = match[1];

        // Find the product card — use a broad range of common eBay item containers
        const card = (link.closest('.s-item') ||
          link.closest('.srp-river-answer') ||
          link.closest('li[id^="item"]') ||
          link.closest('.grid-item') ||
          link.closest('li')) as HTMLElement;

        if (!card) return;

        // Skip cards inside horizontal carousels, merch modules, sponsored scrollers, and recommendation blocks.
        // These sections have fragile horizontal layouts that break if we inject full-width overlays.
        if (card.closest('.ebayui-carousel, .hl-carousel, .srp-carousel, .b-carousel, [class*="carousel"]')) return;
        if (card.closest('.srp-river-answer, .merch-module, [class*="merch-"], [class*="sponsored-"], [class*="reco-"], [class*="promotional"]')) return;

        // Skip if the parent appears to be a horizontal scroller or part of a non-standard grid
        const parent = card.parentElement;
        if (parent && (parent.scrollWidth > parent.clientWidth || getComputedStyle(parent).display === 'flex' && !parent.classList.contains('srp-results'))) {
          // If it's a flex container but not our main results list, it's likely a carousel item
          if (!parent.classList.contains('srp-results') && !parent.closest('.srp-results')) return;
        }

        // Skip if overlay already exists
        if (card.querySelector(`.grab-ebay-mount[data-id="${itemId}"]`)) return;

        card.setAttribute('data-grab-injected', 'true');

        const titleEl = card.querySelector('.s-item__title span, .s-item__title, h3, [class*="title"]') || link;
        const title = titleEl?.textContent?.replace(/New Listing/i, '').trim() || "eBay Product";

        let soldCount = "N/A";
        let watchers = "N/A";

        const hotnessText = card.querySelector('.s-item__hotness, .s-item__quantitySold, .s-item__dynamic, .s-item__trending, .s-item__item-stats')?.textContent?.trim() || "";
        const allCardText = (card as HTMLElement).innerText || "";

        // Extract Sold - handle various formats like "123 sold", "10+ sold".
        // Extract Sold - handle various formats like "1 sold", "123 sold", "10+ sold", "1.5K sold", "10 items sold"
        const soldMatch = hotnessText.match(/([\d,+.kK+]+(?:(?:\s+items|\s+units))?\s+sold)/i) ||
          allCardText.match(/([\d,+.kK+]+(?:(?:\s+items|\s+units))?\s+sold)/i) ||
          allCardText.match(/Sold[\s:]*([\d,+.kK+]+)/i) ||
          allCardText.match(/([\d,+.kK+]+)\s+bought/i);
        if (soldMatch) {
          soldCount = soldMatch[1] || soldMatch[0];
          // Clean up string to be just the number and 'sold'
          soldCount = soldCount.replace(/(?:items|units?)\s+/i, '').trim();
        }

        // Extract Watchers - handle "10 watching", "5 watchers", "10+ watching", "X views per day"
        const watchersMatch = hotnessText.match(/([\d,+]+\s+watch(?:ing|ers))/i) ||
          allCardText.match(/([\d,+]+\s+watch(?:ing|ers))/i) ||
          allCardText.match(/([\d,+]+\s+views?)/i) ||
          allCardText.match(/([\d,+]+\s+tracking)/i);
        if (watchersMatch) watchers = watchersMatch[1] || watchersMatch[0];

        let price = card.querySelector('.s-item__price')?.textContent?.trim() || "N/A";
        let shipping = card.querySelector('.s-item__shipping, .s-item__logisticsCost, .s-item__free-shipping')?.textContent?.trim() || "";

        let seller = "Unknown";
        const sellerSelectors = [
          '.s-item__seller-info-text',
          '.s-item__seller-info',
          '.s-item__username',
          '[class*="seller-info"]',
          '.s-item__title--tag',
          'a[href*="/usr/"]',
          'a[href*="/str/"]',
          '.s-item__seller-info span'
        ];

        for (const selector of sellerSelectors) {
          const el = card.querySelector(selector);
          if (el && el.textContent?.trim()) {
            const txt = el.textContent.trim();
            const m = txt.match(/Seller:\s*([^\s(]+)/i) ||
              txt.match(/^([^\s(]+)\s*\(/) ||
              txt.match(/([a-zA-Z0-9\-_.]+)\s+\(/);
            seller = m ? m[1] : txt.replace(/Store\s*:\s*/i, '').split(/\s+\(/)[0];
            if (seller && !seller.toLowerCase().includes('positive feedback') && seller !== "Seller") break;
          }
        }

        if (seller === "Unknown" || seller.length > 50) {
          const cardText = (card as HTMLElement).innerText || "";
          // Look for "username 99.8% positive"
          const fbMatch = cardText.match(/([a-zA-Z0-9\-_.]+)\s+\d+(?:\.\d+)?%\s+positive/i);
          if (fbMatch && fbMatch[1] && fbMatch[1].length < 40) {
            seller = fbMatch[1];
          } else {
            const m = cardText.match(/Seller:\s*([^\s(]+)/i);
            if (m) seller = m[1];
          }
        }

        if (price === "N/A") {
          const pMatch = allCardText.match(/\$[\d,.]+/);
          if (pMatch) price = pMatch[0];
        }

        const imgEl = card.querySelector('.s-item__image-img, .s-item__image img, img') as HTMLImageElement;
        const imageUrl = imgEl?.getAttribute('data-src') || imgEl?.src || '';

        const titleArea = card.querySelector('.s-item__title, h3, [class*="title"]') as HTMLElement;
        const priceArea = card.querySelector('.s-item__price, .s-item__price-section, [class*="price"]') as HTMLElement;

        let targetEl: HTMLElement | null = null;

        if (titleArea) {
          let wrapper = card.querySelector('.grab-ebay-target') as HTMLElement;
          if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'grab-ebay-target';
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'flex-end';
            wrapper.style.width = '100%';
            titleArea.insertAdjacentElement('afterend', wrapper);
          }
          targetEl = wrapper;
        } else if (priceArea) {
          let wrapper = card.querySelector('.grab-ebay-target') as HTMLElement;
          if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'grab-ebay-target';
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'flex-end';
            wrapper.style.width = '100%';
            priceArea.insertAdjacentElement('afterend', wrapper);
          }
          targetEl = wrapper;
        } else {
          targetEl = card.querySelector('.s-item__info, .s-item__details') as HTMLElement || card;
        }

        mountEbaySearchCard(itemId, title, targetEl, {
          price, shipping, seller: seller !== "Unknown" ? seller : "⏳ Loading...",
          soldCount, watchers, imageUrl, brand: ""
        });

        if (seller === "Unknown" || soldCount === "N/A" || soldCount.startsWith('Sold ') || watchers === "N/A" || true) {
          fetchEbaySeller(itemId).then(({ seller: fetchedSeller, soldCount: fetchedSold, watchers: fetchedWatchers, brand: fetchedBrand }) => {
            const finalSeller = fetchedSeller !== "Unknown" ? fetchedSeller : (seller !== "Unknown" ? seller : "N/A");
            const finalSold = (fetchedSold !== "N/A" && (soldCount === "N/A" || soldCount.startsWith('Sold ') || !fetchedSold.includes('Sold '))) ? fetchedSold : soldCount;
            const finalWatchers = fetchedWatchers !== "N/A" ? fetchedWatchers : watchers;
            
            mountEbaySearchCard(itemId, title, targetEl, {
              price, shipping, seller: finalSeller,
              soldCount: finalSold, watchers: finalWatchers, imageUrl, brand: fetchedBrand
            });
          });
        }
      });
    };

    const updateLinks = () => {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/itm/"], a[href*="ebay."][href*="item="]');
      links.forEach(anchor => {
        if (anchor.getAttribute('data-grab-tagged') === 'true') return;
        const affiliateUrl = buildEbayAffiliateUrl(anchor.href);
        if (affiliateUrl) {
          anchor.href = affiliateUrl;
          anchor.setAttribute('data-grab-tagged', 'true');
        }
      });
    };

    const combinedTask = () => {
      processSearchCards();
      updateLinks();
    };

    const debouncedTask = debounce(combinedTask, 150); // Fast debounce for near-instant card injection
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes.length > 0)) {
        debouncedTask();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    combinedTask();

    document.addEventListener('click', (e) => {
      const anchor = (e.target as HTMLElement).closest?.('a[href*="ebay."]') as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;

      const fixed = buildEbayAffiliateUrl(anchor.href);
      if (fixed) {
        anchor.href = fixed;
        anchor.setAttribute('data-grab-tagged', 'true');
      }
    }, { capture: true });

  } else {
    const tryMountEbay = () => {
      const data = extractEbayData();
      if (document.querySelector('.grab-history-mount')) return;
      if (data.title !== "Title not found") {
        mountOverlay(data, 'h1.x-item-title__mainTitle, .x-item-title__mainTitle span, .vi-atf-main-ar-title, h1');
      } else {
        setTimeout(tryMountEbay, 1000);
      }
    };
    tryMountEbay();
  }
};

console.log("SoldSnap: eBay Script Loaded");
initEbayExtension();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "getProductData") {
    const isProductPage = window.location.href.includes('/itm/') || window.location.href.includes('/p/') || !!document.querySelector('.x-item-title__mainTitle, .vi-is1-titleH1');
    const isSearch = !isProductPage;
    if (isSearch) {
      sendResponse({ isSearchPage: true });
    } else {
      sendResponse(extractEbayData());
    }
  }
  return true;
});
