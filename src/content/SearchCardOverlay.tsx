import React, { useState, useEffect, useRef } from 'react';

interface SearchCardProps {
  asin: string;
  title: string;
  initialData: {
    price: string;
    prime: boolean;
    stock: string | null;
    seller: string;
    rank: string;
    boughtCount?: string;
  };
}

const CACHE_TTL = 30 * 60 * 1000; // 30 mins cache

let activeRequests = 0;
const MAX_CONCURRENT = 3;
const queue: Array<() => void> = [];

const enqueue = (task: () => void) => {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    task();
  } else {
    queue.push(task);
  }
};

const dequeue = () => {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    activeRequests++;
    next();
  }
};

const parseRank = (text: string): string => {
  const patterns = [
    /(?:Best Sellers?\s*Rank|Amazon Bestsellers?\s*Rank|Bestsellers?\s*Rank|Bestseller-Rang)[\s:#]*(#?[0-9,]+)\s+in\s+([^(\n\r\t]{3,50})/i,
    /(#[0-9,]+)\s+in\s+([A-Za-z][A-Za-z0-9\s,&]{3,40})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const num = m[1].startsWith('#') ? m[1] : `#${m[1]}`;
      const cat = m[2].trim().split(/[\n(]/)[0].trim();
      if (cat.length > 2 && !/^\d+$/.test(cat)) return `${num} in ${cat}`;
      return num;
    }
  }
  return 'N/A';
};

const parseSeller = (doc: Document, html: string, bodyText: string): string => {
  const selectors = [
    '#sellerProfileTriggerId',
    '#merchant-info a',
    '#tabular-buybox-seller span',
    '.tabular-buybox-text span',
    '#bylineInfo',
    '#brand',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel) as HTMLElement;
    const t = el?.textContent?.trim();
    if (t && t.length > 1 && !t.includes('Sign in')) {
      const clean = t
        .replace(/Visit the\s+/i, '')
        .replace(/\s+Store\s*,?\s*/gi, ' ')
        .replace(/Sold by\s+/i, '')
        .split(/[\n,]/)[0]
        .trim();
      if (clean) return clean.toLowerCase().includes('amazon') ? 'Amazon' : clean;
    }
  }
  if (/sold by amazon|dispatched from and sold by amazon/i.test(html)) return 'Amazon';
  const m = bodyText.match(/Sold\s+by\s+([A-Za-z0-9][A-Za-z0-9\s,&.]{1,40})/i);
  return m ? m[1].trim().split('\n')[0] : 'N/A';
};

const parseQty = (doc: Document, initialQty: string | null): string | null => {
  // 1. Quantity dropdown
  const qtySelect = doc.getElementById('quantity') as HTMLSelectElement;
  if (qtySelect?.options?.length) {
    const lastVal = parseInt(qtySelect.options[qtySelect.options.length - 1].value, 10);
    if (!isNaN(lastVal)) return `${lastVal}+`;
  }

  const availEl = doc.getElementById('availability') as HTMLElement;
  const text = availEl?.textContent || doc.body.textContent || '';

  // 2. Only X left
  const lowMatch = text.match(/only\s+(\d+)\s+left/i);
  if (lowMatch) return lowMatch[1];

  // 3. Out of stock
  if (/out of stock|currently unavailable/i.test(text)) return '0';

  // 4. Add to cart button = definitely in stock
  if (doc.getElementById('add-to-cart-button')) return 'In Stock';

  // 5. In stock text
  if (/in stock|dispatched within/i.test(text)) return 'In Stock';

  // 6. Try number from initialQty
  const initNum = initialQty?.match(/\d+/);
  if (initNum) return initNum[0];

  return null;
};

export const SearchCardOverlay: React.FC<SearchCardProps> = ({ asin, title, initialData }) => {
  const [rank, setRank] = useState(initialData.rank || '...');
  const [seller, setSeller] = useState(initialData.seller || '...');
  const [qty, setQty] = useState<string | null>(initialData.stock || null);
  const [fba, setFba] = useState(initialData.prime);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [isVisible, setIsVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  const fetchBackgroundData = async () => {
    if (!mounted.current) return;
    setStatus('loading');

    try {
      const domain = window.location.hostname.replace('www.', '');
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'fetchHtml', url: `https://www.${domain}/dp/${asin}` },
          resolve
        );
      });

      if (!mounted.current) { dequeue(); return; }
      if (!response?.html || response.error) throw new Error(response?.error || 'No HTML');

      const { html } = response;
      if (html.includes('api-services-support@amazon.com') || html.includes('captcha')) {
        if (mounted.current) {
          setRank('Blocked');
          setQty('Blocked');
          setStatus('error');
        }
        dequeue();
        return;
      }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const bodyText = doc.body?.textContent || '';

      const foundRank = parseRank(bodyText);
      const foundSeller = parseSeller(doc, html, bodyText);
      const foundQty = parseQty(doc, initialData.stock) || 'In Stock';
      const foundFba = initialData.prime ||
        /Fulfilled by Amazon|Ships from Amazon/i.test(html) ||
        !!doc.querySelector('i.a-icon-prime');

      const newData = {
        rank: foundRank,
        seller: foundSeller,
        qty: foundQty,
        fba: foundFba,
        ts: Date.now(),
      };

      // Persist to storage
      chrome.storage.local.set({ [`asin_${asin}`]: newData });

      if (mounted.current) {
        setRank(foundRank);
        setSeller(foundSeller);
        setQty(foundQty);
        setFba(foundFba);
        setStatus('done');
      }
    } catch {
      if (mounted.current) {
        setRank('N/A');
        setQty('N/A');
        setStatus('error');
      }
    } finally {
      dequeue();
    }
  };

  useEffect(() => {
    mounted.current = true;

    // Use IntersectionObserver to lazy load data when scrolled into view
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before scroll-into-view
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      mounted.current = false;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    // Check storage first
    chrome.storage.local.get([`asin_${asin}`], (res) => {
      if (!mounted.current) return;
      const cached = res[`asin_${asin}`] as { rank: string; seller: string; qty: string | null; fba: boolean; ts: number } | undefined;

      if (cached && (Date.now() - cached.ts < CACHE_TTL)) {
        setRank(cached.rank);
        setSeller(cached.seller);
        setQty(cached.qty);
        setFba(cached.fba);
        setStatus('done');
      } else {
        enqueue(fetchBackgroundData);
      }
    });
  }, [isVisible, asin]);

  const isLoading = status === 'loading';

  const renderStock = () => {
    if (isLoading && !qty) return <span className="g-skeleton" style={{ width: 60 }} />;
    const qtyStr = qty || '';
    if (qtyStr === '0') return <span className="g-val" style={{ color: '#dc2626' }}>0</span>;
    if (qtyStr.toLowerCase() === 'in stock') return <span className="g-val" style={{ color: '#16a34a' }}>✓</span>;


    const num = parseInt(qtyStr, 10);
    if (!isNaN(num)) {
      const color = num <= 5 ? '#d97706' : '#16a34a';
      const label = qtyStr.includes('+') ? `${num}+` : `${num}`;
      return <span className="g-val" style={{ color }}>{label}</span>;
    }

    const isOos = /oos|unavailable|blocked/i.test(qtyStr);
    return <span className="g-val" style={{ color: isOos ? '#dc2626' : '#9ca3af' }}>{qtyStr}</span>;
  };

  return (
    <div
      ref={containerRef}
      className="grab-search-overlay"
      onClick={(e) => { e.stopPropagation(); }}
      onMouseDown={e => e.stopPropagation()}
      style={{
        marginTop: '8px',
        padding: '0',
        background: 'transparent',
        border: 'none',
        fontSize: '13px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#1e293b',
        lineHeight: '1.6',
        display: 'block',
        width: '100%',
        maxWidth: '350px',
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        .grab-search-overlay .g-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(0,0,0,0.07);
        }
        .grab-search-overlay .g-row:last-of-type { border-bottom: none; }
        .grab-search-overlay .g-label {
          color: #6b7280;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.06em;
          min-width: 72px;
        }
        .grab-search-overlay .g-val {
          font-weight: 700;
          color: #111827;
          font-size: 12px;
        }
        .grab-search-overlay .g-skeleton {
          display: inline-block;
          width: 80px;
          height: 12px;
          border-radius: 4px;
          background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
          background-size: 200% 100%;
          animation: g-shimmer 1.2s infinite;
          vertical-align: middle;
        }
        @keyframes g-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .grab-search-overlay .g-badges {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .grab-search-overlay .g-badge {
          padding: 3px 10px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 11px;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #374151;
          text-decoration: none;
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .grab-search-overlay .g-badge:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
      `}} />

      <div className="g-row">
        <span className="g-label">ASIN</span>
        <span className="g-val">{asin}</span>
      </div>

      <div className="g-row">
        <span className="g-label">Rank</span>
        <span className="g-val" style={{ color: '#ea580c' }}>
          {isLoading && rank === '...' ? <span className="g-skeleton" /> : rank}
        </span>
      </div>

      <div className="g-row">
        <span className="g-label">BuyBox</span>
        <span className="g-val" style={{ color: '#2563eb' }}>
          {isLoading && seller === '...' ? <span className="g-skeleton" style={{ width: 100 }} /> : seller}
        </span>
      </div>

      <div className="g-row">
        <span className="g-label">Bought</span>
        <span className="g-val" style={{ color: '#c45500', fontWeight: 'bold' }}>
          {initialData?.boughtCount || 'N/A'}
        </span>
      </div>

      <div className="g-row">
        <span className="g-label">FBA</span>
        <span className="g-val" style={{ color: fba ? '#16a34a' : '#6b7280' }}>
          {fba ? 'Yes ✓' : 'No'}
        </span>
      </div>

      <div className="g-row">
        <span className="g-label">Stock</span>
        {renderStock()}
      </div>

      <div className="g-badges" style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{ color: '#565959', fontSize: '10px', fontWeight: 'bold', width: '100%', marginBottom: '2px' }}>SEARCH ON:</span>
        <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#0064D2', border: '1px solid #0064D2', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', textDecoration: 'none' }}>EBAY</a>
        <a href={`https://www.walmart.com/search?q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#0071CE', border: '1px solid #0071CE', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', textDecoration: 'none' }}>WALMART</a>
        <a href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#FF4747', border: '1px solid #FF4747', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', textDecoration: 'none' }}>ALIEXPRESS</a>
        <a href={`https://www.google.com/search?q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#4285F4', border: '1px solid #4285F4', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', textDecoration: 'none' }}>GOOGLE</a>
      </div>
    </div>
  );
};