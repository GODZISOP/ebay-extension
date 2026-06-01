import { createRoot } from 'react-dom/client';
import { Overlay } from './Overlay';
import { SearchCardOverlay } from './SearchCardOverlay';
import { EbaySearchCardOverlay } from './EbaySearchCardOverlay';
import { AliSearchCardOverlay } from './AliSearchCardOverlay';

// ─── Product Page Overlay ─────────────────────────────────────────────────────

export const mountOverlay = (data: any, selector: string, forceFixed = false) => {
  const existing = document.querySelector('.grab-history-mount');
  if (existing) existing.remove();

  const mountPoint = document.createElement('div');
  mountPoint.className = 'grab-history-mount';

  if (!forceFixed) {
    // Try passed selector first, then fallbacks for different Amazon layouts
    const selectors = [
      selector,
      '#centerCol',
      '#ppd',           // newer Amazon layout
      '#productTitle',  // absolute fallback — above title
      '#dp-container',
    ];

    let target: Element | null = null;
    for (const sel of selectors) {
      target = document.querySelector(sel);
      if (target) break;
    }

    if (target) {
      target.prepend(mountPoint);
      mountPoint.style.marginBottom = '16px';
      const root = createRoot(mountPoint);
      root.render(<Overlay data={data} />);
      return;
    }
  }

  // Fallback: fixed floating panel
  document.body.appendChild(mountPoint);
  Object.assign(mountPoint.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '360px',
    zIndex: '2147483647',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
  });
  const root = createRoot(mountPoint);
  root.render(<Overlay data={data} />);
};

// ─── Amazon Search Card ───────────────────────────────────────────────────────

export const mountSearchCard = (
  asin: string,
  title: string,
  targetEl: Element,
  initialData: any,
) => {
  if (targetEl.querySelector(`.grab-search-mount[data-asin="${asin}"]`)) return;

  const mountPoint = document.createElement('div');
  mountPoint.className = 'grab-search-mount';
  mountPoint.setAttribute('data-asin', asin);

  targetEl.appendChild(mountPoint);
  const root = createRoot(mountPoint);
  root.render(<SearchCardOverlay asin={asin} title={title} initialData={initialData} />);
};

// ─── eBay Search Card ─────────────────────────────────────────────────────────

export const mountEbaySearchCard = (
  itemId: string,
  title: string,
  targetEl: Element,
  data: any,
) => {
  const card = targetEl.closest('.s-item') || targetEl.closest('li') || targetEl;
  let mountPoint = card.querySelector(`.grab-ebay-mount[data-id="${itemId}"]`) as any;

  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.className = 'grab-ebay-mount';
    mountPoint.setAttribute('data-id', itemId);
    Object.assign(mountPoint.style, {
      boxSizing: 'border-box',
      marginTop: '8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      width: '100%'
    });
    targetEl.appendChild(mountPoint);
    mountPoint._reactRoot = createRoot(mountPoint);
  }

  mountPoint._reactRoot.render(<EbaySearchCardOverlay itemId={itemId} title={title} data={data} />);
};

// ─── AliExpress Search Card ───────────────────────────────────────────────────

export const mountAliSearchCard = (
  itemId: string,
  title: string,
  targetEl: Element,
  data: any,
) => {
  // Broad check for existing mount in the card
  const card = targetEl.closest('.search-item, .item-main, .product-item, [class*="item"]');
  if (card && card.querySelector(`.grab-ali-mount[data-id="${itemId}"]`)) return;

  if (targetEl.querySelector(`.grab-ali-mount[data-id="${itemId}"]`)) return;

  const mountPoint = document.createElement('div');
  mountPoint.className = 'grab-ali-mount';
  mountPoint.setAttribute('data-id', itemId);

  targetEl.appendChild(mountPoint);
  const root = createRoot(mountPoint);
  root.render(<AliSearchCardOverlay itemId={itemId} title={title} data={data} />);
};