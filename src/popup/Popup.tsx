import React, { useState, useEffect } from 'react';
import { Settings, Search, Download, Save, ExternalLink, Copy, Check, Loader2 } from 'lucide-react';
import logoUrl from '../assets/logo.png';
import { storage } from '../utils/storage';

interface ProductData {
  title: string;
  price: string;
  images: string[];
  seller: string;
  soldCount: string;
  url: string;
  timestamp?: number;
  asin?: string;
  rank?: string;
  originalPrice?: string;
  prime?: string;
  qty?: string;
}

export const Popup: React.FC = () => {
  const [view, setView] = useState<'current' | 'history' | 'search'>('current');
  const [product, setProduct] = useState<ProductData | null>(null);
  const [historyItems, setHistoryItems] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (view === 'current') {
      loadCurrentProduct();
    } else {
      loadHistory();
    }
  }, [view]);

  const loadCurrentProduct = async () => {
    setLoading(true);

    // ── Network check ──────────────────────────────────────────────────
    if (!navigator.onLine) {
      setProduct(null);
      setStatusMsg({ type: 'offline', text: 'No Internet' });
      setLoading(false);
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !/amazon\.|aliexpress\.|ebay\./.test(tab.url)) {
        setProduct(null);
        setStatusMsg({ type: 'not_supported', text: 'Not on supported page' });
        setLoading(false);
        return;
      }

      // Auto-retry up to 10 times (500ms apart) in case the DOM is slow to render
      const tryFetch = (attemptsLeft: number) => {
        chrome.tabs.sendMessage(tab.id!, { action: "getProductData" }, (response) => {
          const isError = chrome.runtime.lastError || !response;
          
          if (response && response.isSearchPage) {
            setProduct(null);
            setStatusMsg({ type: 'search_page', text: 'On Search Page' });
            setLoading(false);
            return;
          }

          // We only strictly require the title. Sometimes products are out of stock and have no price.
          const isIncomplete = response && response.title === "Title not found";
          
          if (isError || isIncomplete) {
            if (attemptsLeft > 0) {
              // Wait 500ms and retry automatically
              setTimeout(() => tryFetch(attemptsLeft - 1), 500);
            } else {
              setProduct(response || null);
              setStatusMsg({ type: 'error', text: isError ? 'needs_reload' : '' });
              setLoading(false);
            }
          } else {
            setProduct(response);
            setStatusMsg({ type: '', text: '' });
            setLoading(false);
          }
        });
      };

      tryFetch(10); // 10 attempts * 500ms = 5 seconds max wait
    } catch (e) {
      setProduct(null);
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    const items = await storage.get('history') || [];
    setHistoryItems(items);
  };

  const handleDownload = () => {
    if (!product) return;
    chrome.runtime.sendMessage({
      action: "downloadImages",
      urls: product.images,
      folderName: product.title.substring(0, 30).replace(/[^a-z0-9]/gi, '_')
    });
    showStatus('download', 'Download Started');
  };

  const handleSave = async () => {
    if (!product) return;
    const history = await storage.get('history') || [];
    const newHistory = [
      { ...product, timestamp: Date.now() },
      ...history.filter((p: any) => p.url !== product.url)
    ].slice(0, 50);
    await storage.set('history', newHistory);
    showStatus('save', 'Saved to History');
  };

  const handleCopyLink = () => {
    if (!product) return;
    const urlObj = new URL(product.url);
    if (urlObj.hostname.includes('amazon.com')) urlObj.searchParams.set('tag', 'alex3210b-20');
    else if (urlObj.hostname.includes('amazon.co.uk')) urlObj.searchParams.set('tag', 'deluxmerge212-21');
    else if (urlObj.hostname.includes('amazon.com.au')) urlObj.searchParams.set('tag', 'asds0d-22');
    
    navigator.clipboard.writeText(urlObj.toString());
    showStatus('copy', 'Link Copied');
  };

  const showStatus = (type: string, text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg({ type: '', text: '' }), 2000);
  };

  const filteredHistory = historyItems.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container">
      <header>
        <div className="logo">
          <img src={logoUrl} alt="SoldSnap" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <h1>Sold<span>Snap</span></h1>
        </div>
        <button className="icon-btn"><Settings size={18} /></button>
      </header>

      <main>
        {view === 'current' && (
          loading ? (
            <div className="loader-view">
              <Loader2 className="spinner" size={32} />
              <p>Scanning product details...</p>
            </div>
          ) : product ? (
            <div className="product-view">
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Search On</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.title)}`} target="_blank" rel="noreferrer" className="search-pill">eBay</a>
                    <a href={`https://www.walmart.com/search?q=${encodeURIComponent(product.title)}`} target="_blank" rel="noreferrer" className="search-pill">Walmart</a>
                    <a href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.title)}`} target="_blank" rel="noreferrer" className="search-pill">AliExpress</a>
                    {product.images[0] && (
                      <a href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(product.images[0])}`} target="_blank" rel="noreferrer" className="search-pill search-pill-img">🔍 Search by Image</a>
                    )}
                  </div>
                </div>

              <div className="product-header">
                <div 
                  className="image-preview" 
                  style={{ backgroundImage: `url(${product.images[0]})` }}
                />
                <div className="product-info">
                  <h2>{product.title}</h2>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <div className="price-badge">{product.price}</div>
                    {product.originalPrice && product.originalPrice !== product.price && (
                      <div style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '12px' }}>
                        {product.originalPrice}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                {product.asin && (
                  <div className="stat-card" style={{ gridColumn: 'span 2' }}>
                    <label>ASIN</label>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'monospace' }}>{product.asin}</span>
                      <button 
                        className="text-btn" 
                        onClick={() => {
                          navigator.clipboard.writeText(product.asin || '');
                          showStatus('copy', 'ASIN Copied');
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <div className="stat-card">
                  <label>Seller / Fulfillment</label>
                  <span>{product.seller} {product.prime ? `(${product.prime})` : ''}</span>
                </div>
                <div className="stat-card">
                  <label>Sold / Rank</label>
                  <span title={product.rank || product.soldCount}>
                    {product.rank && product.rank !== "N/A" ? product.rank.split('in')[0] : product.soldCount}
                  </span>
                </div>
                {product.qty && product.qty !== "Unknown" && (
                  <div className="stat-card" style={{ gridColumn: 'span 2' }}>
                    <label>Qty Available</label>
                    <span>{product.qty}</span>
                  </div>
                )}
              </div>

              <div className="actions">
                <button className="primary-btn" onClick={handleDownload}>
                  {statusMsg.type === 'download' ? <Check size={18} /> : <Download size={18} />}
                  {statusMsg.type === 'download' ? statusMsg.text : 'Download All Images (ZIP ready)'}
                </button>
                <div className="btn-group">
                  <button className="secondary-btn" onClick={handleSave}>
                    {statusMsg.type === 'save' ? <Check size={18} /> : <Save size={18} />}
                    {statusMsg.type === 'save' ? statusMsg.text : 'Save'}
                  </button>
                  <button className="secondary-btn" onClick={handleCopyLink}>
                    {statusMsg.type === 'copy' ? <Check size={18} /> : <Copy size={18} />}
                    {statusMsg.type === 'copy' ? statusMsg.text : 'Share Link'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              {statusMsg.type === 'offline' ? (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📡</div>
                  <h3 style={{ color: '#ef4444' }}>No Internet Connection</h3>
                  <p>Please check your network connection and try again.</p>
                  <button 
                    className="primary-btn" 
                    style={{ marginTop: '16px' }}
                    onClick={() => {
                      setStatusMsg({ type: '', text: '' });
                      loadCurrentProduct();
                    }}
                  >
                    Retry
                  </button>
                </>
              ) : statusMsg.type === 'not_supported' ? (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛒</div>
                  <h3>Go to a Product Page First!</h3>
                  <p>Open <strong>Amazon</strong>, <strong>eBay</strong>, or <strong>AliExpress</strong> to use this extension.</p>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                    <a href="https://www.amazon.com" target="_blank" rel="noreferrer" className="search-pill" style={{ padding: '6px 14px', fontWeight: 700 }}>Amazon</a>
                    <a href="https://www.ebay.com" target="_blank" rel="noreferrer" className="search-pill" style={{ padding: '6px 14px', fontWeight: 700 }}>eBay</a>
                    <a href="https://www.aliexpress.com" target="_blank" rel="noreferrer" className="search-pill" style={{ padding: '6px 14px', fontWeight: 700 }}>AliExpress</a>
                  </div>
                </>
              ) : statusMsg.type === 'search_page' ? (
                <>
                  <Search className="empty-icon" size={48} style={{ color: '#2563eb' }} />
                  <h3>Search Page Detected</h3>
                  <p>You are on a search results page. The extension has injected mini data cards directly into the products on the page!</p>
                  <p style={{ fontSize: '12px', marginTop: '8px', color: '#64748b' }}>Click on a specific product to see full details and download images here.</p>
                </>
              ) : (
                <>
                  <Search className="empty-icon" size={48} />
                  {statusMsg.text === 'needs_reload' ? (
                    <>
                      <h3>Refresh the Page!</h3>
                      <p>Please refresh the Amazon, eBay, or AliExpress page so the extension can load.</p>
                      <button 
                        className="primary-btn" 
                        style={{ marginTop: '16px' }}
                        onClick={async () => {
                          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                          if (tab?.id) {
                            chrome.tabs.reload(tab.id);
                            window.close(); // Close popup so they can reopen it after refresh
                          }
                        }}
                      >
                        Refresh Tab Now
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>No Product Found</h3>
                      <p>Open a product page on Amazon, eBay, or AliExpress.</p>
                    </>
                  )}
                </>
              )}
            </div>
          )
        )}

        {(view === 'history' || view === 'search') && (
          <div className="history-view">
            <div className="view-header">
              <h3>{view === 'history' ? 'Recent History' : 'Search History'}</h3>
              {view === 'history' && (
                <button 
                  className="text-btn" 
                  onClick={async () => {
                    if (confirm("Clear history?")) {
                      await storage.set('history', []);
                      loadHistory();
                    }
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            
            {view === 'search' && (
              <div className="search-box">
                <Search size={16} />
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="history-list">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((item, i) => (
                  <div key={i} className="history-item" onClick={() => chrome.tabs.create({ url: item.url })}>
                    <div className="history-img" style={{ backgroundImage: `url(${item.images[0]})` }} />
                    <div className="history-details">
                      <h4>{item.title}</h4>
                      <div className="history-meta">
                        <span className="h-price">{item.price}</span>
                        <ExternalLink size={12} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-history">No items found</div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer>
        <div className="tabs">
          <button 
            className={`tab-btn ${view === 'current' ? 'active' : ''}`}
            onClick={() => setView('current')}
          >
            Current
          </button>
          <button 
            className={`tab-btn ${view === 'history' ? 'active' : ''}`}
            onClick={() => setView('history')}
          >
            History
          </button>
          <button 
            className={`tab-btn ${view === 'search' ? 'active' : ''}`}
            onClick={() => setView('search')}
          >
            Search
          </button>
        </div>
      </footer>
    </div>
  );
};
