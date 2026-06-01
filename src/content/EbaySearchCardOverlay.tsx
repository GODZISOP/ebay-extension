import React from 'react';

interface EbaySearchCardProps {
  itemId: string;
  title: string;
  data: any;
}

export const EbaySearchCardOverlay: React.FC<EbaySearchCardProps> = ({ itemId, title, data }) => {
  return (
    <div
      className="grab-history-search-card"
      onClick={(e) => { e.stopPropagation(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        marginTop: '6px', marginBottom: '2px', padding: '8px',
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#0f1111',
        lineHeight: '1.4', position: 'relative', display: 'block',
        width: '100%', maxWidth: '280px', marginLeft: 'auto', boxSizing: 'border-box',
        zIndex: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .grab-history-search-card a { color: #007185; text-decoration: none; font-weight: bold; }
        .grab-history-search-card a:hover { color: #c45500; text-decoration: underline; }
        .grab-row { margin-bottom: 2px; }
      `}} />

      {/* Search By Row */}
      <div className="grab-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
        <span style={{ color: '#565959', fontSize: '11px', fontWeight: 'bold' }}>SEARCH ON:</span>
        <a href={`https://www.amazon.com/s?k=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#FF9900', border: '1px solid #FF9900', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>AMAZON</a>
        <a href={`https://www.walmart.com/search?q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#0071CE', border: '1px solid #0071CE', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>WALMART</a>
        <a href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" style={{ color: '#FF4747', border: '1px solid #FF4747', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>ALIEXPRESS</a>
        <a href={`https://www.google.com/search?q=${encodeURIComponent(title)}+site:ebay.com`} target="_blank" rel="noreferrer" style={{ color: '#4285F4', border: '1px solid #4285F4', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>GOOGLE</a>
      </div>

      <div className="grab-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><span style={{ color: '#565959' }}>eBay ID:</span> <span style={{ fontWeight: 'bold' }}>{itemId}</span></div>
        <div style={{ color: '#007185', fontWeight: 'bold' }}>{data?.price || "N/A"}</div>
      </div>

      <div className="grab-row">
        <span style={{ color: '#565959' }}>Seller:</span> <span data-field="seller" style={{ fontWeight: 'bold' }}>{data?.seller || "Unknown"}</span>
      </div>

      {data?.brand && (
        <div className="grab-row">
          <span style={{ color: '#565959' }}>Brand:</span> <span data-field="brand" style={{ fontWeight: 'bold' }}>{data.brand}</span>
        </div>
      )}

      <div className="grab-row" style={{ display: 'flex', gap: '15px', marginTop: '4px' }}>
        <div>
          <span style={{ color: '#565959' }}>Sold:</span>{' '}
          <a
            data-field="sold"
            href={`https://www.ebay.com/bin/purchaseHistory?item=${itemId}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#c45500', fontWeight: 'bold', textDecoration: data?.soldCount === 'N/A' ? 'none' : 'underline' }}
          >
            {data?.soldCount || "N/A"}
          </a>
        </div>
        <div>
          <span style={{ color: '#565959' }}>Watchers:</span> <span data-field="watchers" style={{ color: '#c45500', fontWeight: 'bold' }}>{data?.watchers || "N/A"}</span>
        </div>
      </div>

      {data?.imageUrl && (
        <div className="grab-row" style={{ marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
          <a href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(data.imageUrl)}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4b5563' }}>
            🔍 Search by Image
          </a>
        </div>
      )}

    </div>
  );
};
