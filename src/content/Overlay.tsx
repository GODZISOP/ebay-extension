import React, { useState, useEffect } from 'react';
import { Download, Search, Check, ExternalLink, X } from 'lucide-react';
import logoUrl from '../assets/logo.png';

interface ProductData {
  title: string;
  price: string;
  images: string[];
  seller: string;
  soldCount: string;
  url: string;
  asin?: string;
  rank?: string;
  originalPrice?: string;
  prime?: string;
  qty?: string;
  shipping?: string;
  delivery?: string;
  rating?: string;
  sellerRating?: string;
  brand?: string;
}

interface OverlayProps {
  data: ProductData;
}

export const Overlay: React.FC<OverlayProps> = ({ data }) => {
  const [downloading, setDownloading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Sync parent container visibility
  useEffect(() => {
    const mountPoint = containerRef.current?.parentElement;
    if (!mountPoint) return;

    if (isMinimized) {
      // Hide the parent's fixed box styles
      mountPoint.style.setProperty('background', 'transparent', 'important');
      mountPoint.style.setProperty('box-shadow', 'none', 'important');
      mountPoint.style.setProperty('border', 'none', 'important');
      mountPoint.style.setProperty('width', 'auto', 'important');
      mountPoint.style.setProperty('height', 'auto', 'important');
      mountPoint.style.setProperty('pointer-events', 'none', 'important');
    } else {
      // Restore based on whether it's fixed or inline
      const isFixed = mountPoint.style.position === 'fixed';
      if (isFixed) {
        mountPoint.style.setProperty('background', 'white', 'important');
        mountPoint.style.setProperty('box-shadow', '0 10px 25px -5px rgba(0,0,0,0.15)', 'important');
        mountPoint.style.setProperty('border-radius', '12px', 'important');
        mountPoint.style.setProperty('width', '420px', 'important');
        mountPoint.style.setProperty('height', 'auto', 'important');
        mountPoint.style.setProperty('pointer-events', 'auto', 'important');
      } else {
        mountPoint.style.setProperty('background', 'transparent', 'important');
        mountPoint.style.setProperty('box-shadow', 'none', 'important');
        mountPoint.style.setProperty('width', 'auto', 'important');
        mountPoint.style.setProperty('pointer-events', 'auto', 'important');
      }
    }
  }, [isMinimized]);

  if (isMinimized) {
    return (
      <div
        ref={containerRef}
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: '40px',
          background: '#2563eb',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(37, 99, 235, 0.5)',
          zIndex: 2147483647,
          transition: 'all 0.2s ease-out',
          border: '2px solid white',
          pointerEvents: 'auto',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transform: 'none' // Ensure no rotation/tilt
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.background = '#1d4ed8';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = '#2563eb';
        }}
        title="Reopen Analysis"
      >
        <Search size={22} />
        <span style={{ fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap' }}>Show Analysis</span>
        <div style={{
          background: '#ef4444',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          border: '2px solid white',
          boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
        }} />
      </div>
    );
  }

  const handleDownload = () => {
    setDownloading(true);
    
    // Dynamically fetch visible/active images from the DOM at the exact moment of the click
    const extractor = (window as any).extractFreshImages;
    const freshImages = extractor ? extractor() : data.images;
    
    console.log('[DEBUG-EXTRACT] Overlay click-time fresh images count:', freshImages.length, freshImages);

    chrome.runtime.sendMessage({
      action: "downloadImages",
      urls: freshImages,
      folderName: data.title.substring(0, 30).replace(/[^a-z0-9]/gi, '_')
    });
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div ref={containerRef} className="grab-history-overlay" style={{
      margin: '15px 0',
      padding: '16px',
      background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#1e293b',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      clear: 'both',
      width: '100%',
      maxWidth: '480px'
    }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .grab-history-overlay .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .grab-history-overlay .btn-primary {
          background: #2563eb;
          color: white;
        }
        .grab-history-overlay .btn-primary:hover {
          background: #1d4ed8;
        }
        .grab-history-overlay .btn-secondary {
          background: #f1f5f9;
          color: #475569;
        }
        .grab-history-overlay .btn-secondary:hover {
          background: #e2e8f0;
        }
        .grab-history-overlay .stat-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .grab-history-overlay .stat-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .grab-history-overlay .stat-value {
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grab-history-overlay .search-pill {
          padding: 4px 10px;
          border-radius: 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 12px;
          color: #64748b;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
        }
        .grab-history-overlay .search-pill:hover {
          background: white;
          border-color: #cbd5e1;
          color: #2563eb;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        @media (max-width: 400px) {
          .grab-history-overlay {
            max-width: 100% !important;
          }
        }
      `}} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={chrome.runtime.getURL(logoUrl)} alt="SoldSnap Logo" style={{ width: 26, height: 26, borderRadius: '8px' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>Sold<span style={{ color: '#2563eb' }}>Snap</span></div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Product Research Tool</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleDownload}>
            {downloading ? <Check size={16} /> : <Download size={16} />}
            {downloading ? 'Queued' : 'Download Images'}
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            style={{
              background: '#f1f5f9',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#fee2e2';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#64748b';
            }}
            title="Minimize"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div className="stat-box">
          <div className="stat-label">Price / Original</div>
          <div className="stat-value" style={{ color: '#b12704', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span>{data.price}</span>
            {data.originalPrice && data.originalPrice !== data.price && (
              <span style={{ fontSize: '12px', textDecoration: 'line-through', color: '#94a3b8', fontWeight: '400' }}>{data.originalPrice}</span>
            )}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Seller</div>
          <div className="stat-value" title={data.seller} style={{ color: '#007185' }}>{data.seller}</div>
        </div>
        {data.brand && (
          <div className="stat-box">
            <div className="stat-label">Brand</div>
            <div className="stat-value" title={data.brand} style={{ color: '#0f1111' }}>{data.brand}</div>
          </div>
        )}
        <div className="stat-box">
          <div className="stat-label">ASIN / ID</div>
          <div className="stat-value" style={{ fontFamily: 'monospace' }}>{data.asin || 'N/A'}</div>
        </div>

        {/* ← FIX: .split('in')[0] hata diya — poora rank dikhega */}
        <div className="stat-box">
          <div className="stat-label">BSR / Rank</div>
          <div className="stat-value" title={data.rank || 'N/A'} style={{ color: '#c45500' }}>
            {data.rank || 'N/A'}
          </div>
        </div>

        {data.url?.includes('ebay.') && (
          <div className="stat-box">
            <div className="stat-label">Sold History</div>
            <div className="stat-value">
              {data.asin && data.asin !== 'N/A' ? (
                <a
                  href={`https://www.ebay.com/bin/purchaseHistory?item=${data.asin}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}
                >
                  View ({data.soldCount || 'Check'})
                </a>
              ) : 'N/A'}
            </div>
          </div>
        )}

        {data.url?.includes('aliexpress.') && (
          <div className="stat-box">
            <div className="stat-label">Sold History</div>
            <div className="stat-value">
              {data.asin && data.asin !== 'N/A' ? (
                <a
                  href={`https://www.aliprice.com/?z=aliexpress&url=${encodeURIComponent(data.url)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}
                >
                  View ({data.soldCount || 'Check'})
                </a>
              ) : 'N/A'}
            </div>
          </div>
        )}

        <div className="stat-box">
          <div className="stat-label">Shipping</div>
          <div className="stat-value" title={data.shipping}>{data.shipping || 'N/A'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Delivery</div>
          <div className="stat-value" title={data.delivery}>{data.delivery || 'N/A'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Item Rating</div>
          <div className="stat-value" title={data.rating}>{data.rating || 'N/A'}</div>
        </div>
        {data.sellerRating && data.sellerRating !== 'N/A' && (
          <div className="stat-box">
            <div className="stat-label">Store Rating</div>
            <div className="stat-value" title={data.sellerRating} style={{ color: '#007185' }}>{data.sellerRating}</div>
          </div>
        )}
        <div className="stat-box">
          <div className="stat-label">Qty Avail</div>
          <div className="stat-value" style={{ fontWeight: '800' }}>{data.qty || 'N/A'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Compare On:</span>
        {!window.location.hostname.includes('amazon.') && (
          <a href={`https://www.amazon.com/s?k=${encodeURIComponent(data.title)}`} target="_blank" rel="noreferrer" className="search-pill">
            Amazon <ExternalLink size={10} />
          </a>
        )}
        {!window.location.hostname.includes('ebay.') && (
          <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(data.title)}`} target="_blank" rel="noreferrer" className="search-pill">
            eBay <ExternalLink size={10} />
          </a>
        )}
        {!window.location.hostname.includes('walmart.') && (
          <a href={`https://www.walmart.com/search?q=${encodeURIComponent(data.title)}`} target="_blank" rel="noreferrer" className="search-pill">
            Walmart <ExternalLink size={10} />
          </a>
        )}
        {!window.location.hostname.includes('aliexpress.') && (
          <a href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(data.title)}`} target="_blank" rel="noreferrer" className="search-pill">
            AliExpress <ExternalLink size={10} />
          </a>
        )}
        {data.images[0] && (
          <a href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(data.images[0])}`} target="_blank" rel="noreferrer" className="search-pill">
            <Search size={12} /> Image Search
          </a>
        )}
      </div>
    </div>
  );
};