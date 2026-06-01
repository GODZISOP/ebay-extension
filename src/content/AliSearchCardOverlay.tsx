import React from 'react';

interface AliSearchCardProps {
  itemId: string;
  title: string;
  data: any;
}

export const AliSearchCardOverlay: React.FC<AliSearchCardProps> = ({ itemId, title, data }) => {
  return (
    <div
      className="grab-history-search-card"
      onClick={(e) => {
        // Only stop propagation if we didn't click a link
        if (!(e.target as HTMLElement).closest('a')) {
          e.stopPropagation();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        marginTop: '10px', marginBottom: '4px', padding: '12px',
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px',
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#0f1111',
        lineHeight: '1.5', position: 'relative', clear: 'both', display: 'block',
        width: '100%', boxSizing: 'border-box', zIndex: 5, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
      }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .grab-history-search-card a { text-decoration: none; font-weight: bold; }
        .grab-row { margin-bottom: 6px; }
      `}} />

      {/* Search By Row */}
      <div className="grab-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase' }}>SEARCH ON:</span>
        <a href={`https://www.amazon.com/s?k=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#FF9900', border: '1px solid #FF9900', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>AMAZON</a>
        <a href={`https://www.walmart.com/search?q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#0071CE', border: '1px solid #0071CE', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>WALMART</a>
        <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#E53238', border: '1px solid #E53238', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>EBAY</a>
        <a href={`https://www.google.com/search?q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#4285F4', border: '1px solid #4285F4', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>GOOGLE</a>
      </div>

      <div className="grab-row">
        <span style={{ color: '#565959' }}>AliExpress ID:</span> <span style={{ fontWeight: 'bold' }}>{itemId}</span>
      </div>

      <div className="grab-row">
        <span style={{ color: '#007185', fontWeight: 'bold' }}>Price:</span> <span>{data?.price || "N/A"}</span>
      </div>

      <div className="grab-row">
        <span style={{ color: '#007185', fontWeight: 'bold' }}>Seller:</span> <span data-field="seller">{data?.seller || "Unknown"}</span>
      </div>

      <div className="grab-row" style={{ display: 'flex', gap: '15px' }}>
        <div>
          <span style={{ color: '#565959' }}>Sold:</span>{' '}
          <a
            href={`https://www.aliprice.com/?z=aliexpress&url=${encodeURIComponent(`https://www.aliexpress.com/item/${itemId}.html`)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#c45500', fontWeight: 'bold', textDecoration: 'underline' }}
          >
            {data?.soldCount || "Check"}
          </a>
        </div>
        <div>
          <span style={{ color: '#565959' }}>Rating:</span>{' '}
          <span style={{ fontWeight: 'bold' }}>{data?.rating || data?.storeRating || "N/A"}</span>
        </div>
      </div>

      <div className="grab-row">
        <span style={{ color: '#565959' }}>Delivery:</span> <span style={{ fontWeight: 'bold' }}>{data?.delivery || "N/A"}</span>
      </div>

      <div className="grab-row" style={{ marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
        <a href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(data?.imageUrl || '')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4b5563' }}>
          🔍 Search by Image
        </a>
      </div>

    </div>
  );
};
