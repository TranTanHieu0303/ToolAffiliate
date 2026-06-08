import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface Deal {
  id: string;
  platform: string;
  productId: string;
  title: string;
  imageUrl: string;
  originalPrice: number;
  discountPrice: number;
  discountPercent: number;
  originalUrl: string;
  affiliateUrl: string;
  aiCaption: string;
  status: string;
  canUseCoins?: boolean;
  maxCoinsRedeem?: number;
  shopVoucher?: number;
  platformVoucher?: number;
  priceAfterCoins?: number;
  createdAt: string;
}

interface DealsProps {
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const Deals: React.FC<DealsProps> = ({ showNotification }) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  
  const [manualKeyword, setManualKeyword] = useState('');
  const [manualMaxPrice, setManualMaxPrice] = useState('');
  const [searchingManual, setSearchingManual] = useState(false);

  const fetchDeals = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/deals?page=${targetPage}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setDeals(data.data);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching deals:', error);
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKeyword.trim()) return;

    setSearchingManual(true);
    try {
      const rawMaxPrice = manualMaxPrice ? parseFloat(manualMaxPrice) : null;
      const res = await fetch(`${API_BASE}/deals/manual-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keyword: manualKeyword.trim(),
          maxPrice: rawMaxPrice
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`🔍 ${data.message} (Tìm thấy ${data.dealsFound} deals)`);
        setManualKeyword('');
        setManualMaxPrice('');
        setPage(1);
        fetchDeals(1);
      } else {
        showNotification(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setSearchingManual(false);
    }
  };

  useEffect(() => {
    fetchDeals(page);
  }, [page]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('📋 Đã sao chép caption vào clipboard!');
  };

  const handleSendToTelegram = async (id: string) => {
    setActionLoadingId(`send-${id}`);
    try {
      const res = await fetch(`${API_BASE}/deals/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification('🚀 ' + data.message);
        fetchDeals();
      } else {
        showNotification('❌ ' + data.error, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegenerate = async (id: string) => {
    setActionLoadingId(`regen-${id}`);
    try {
      const res = await fetch(`${API_BASE}/deals/${id}/regenerate`, { method: 'POST' });
      if (res.ok) {
        showNotification('✨ Đã tạo lại caption bằng AI thành công!');
        fetchDeals();
      } else {
        showNotification('❌ Không thể tạo lại caption', 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const startEditing = (deal: Deal) => {
    setEditingId(deal.id);
    setEditCaption(deal.aiCaption || '');
  };

  const saveCaption = async (id: string) => {
    setActionLoadingId(`save-${id}`);
    try {
      const res = await fetch(`${API_BASE}/deals/${id}/caption`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCaption: editCaption }),
      });
      if (res.ok) {
        showNotification('💾 Lưu caption thành công!');
        setEditingId(null);
        fetchDeals();
      } else {
        showNotification('❌ Không thể lưu caption', 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h1>Nhật Ký Deals & Captions</h1>
          <p>Xem danh sách deal đã quét, chỉnh sửa caption và sao chép để chia sẻ thủ công sang Zalo/Messenger</p>
        </div>
      </div>

      <div className="glass section-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>🔍 Quét tìm sản phẩm thủ công</h3>
        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            value={manualKeyword}
            onChange={(e) => setManualKeyword(e.target.value)}
            placeholder="Nhập từ khóa sản phẩm muốn quét nhanh..."
            style={{ flexGrow: 1, minWidth: '200px' }}
            disabled={searchingManual}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <input
              type="number"
              className="form-input"
              value={manualMaxPrice}
              onChange={(e) => setManualMaxPrice(e.target.value)}
              placeholder="Giá tối đa (đ) (Không bắt buộc)"
              style={{ width: '220px', margin: 0 }}
              disabled={searchingManual}
            />
            {manualMaxPrice && (
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '500' }}>
                💵: {Number(manualMaxPrice).toLocaleString('vi-VN')}đ
              </span>
            )}
          </div>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '120px', justifyContent: 'center' }}
            disabled={searchingManual || !manualKeyword.trim()}
          >
            {searchingManual ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : '🔍 Tìm Ngay'}
          </button>
        </form>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '30vh' }}>
          <div className="spinner"></div>
        </div>
      ) : deals.length === 0 ? (
        <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Chưa quét được deal nào. Hãy chuyển qua mục Cấu Hình để thêm Từ khóa hoặc nhấp "Quét Deal Ngay" tại Dashboard.
        </div>
      ) : (
        <div className="deals-list">
          {deals.map((deal) => (
            <div key={deal.id} className="glass deal-item">
              <img src={deal.imageUrl || 'https://placehold.co/100'} alt="" className="deal-img" />
              <div className="deal-content">
                <div className="deal-title-row">
                  <h3 className="deal-title">{deal.title}</h3>
                  <span className={`badge ${deal.status === 'SENT' ? 'badge-success' : 'badge-warning'}`}>
                    {deal.status === 'SENT' ? 'Đã gửi Telegram' : 'Chờ gửi'}
                  </span>
                </div>

                <div className="deal-meta-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                  <span className={`badge ${deal.platform === 'SHOPEE' ? 'badge-warning' : 'badge-info'}`}>
                    {deal.platform}
                  </span>
                  <div className="deal-prices">
                    <span className="deal-price-discount">{deal.discountPrice.toLocaleString('vi-VN')}đ</span>
                    <span className="deal-price-orig">{deal.originalPrice.toLocaleString('vi-VN')}đ</span>
                    <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      -{deal.discountPercent}%
                    </span>
                  </div>
                  {deal.priceAfterCoins ? (
                    <span 
                      className="badge" 
                      title={`Voucher Shop: -${(deal.shopVoucher || 0).toLocaleString('vi-VN')}đ | Voucher Sàn: -${(deal.platformVoucher || 0).toLocaleString('vi-VN')}đ | Xu: -${(deal.maxCoinsRedeem || 0).toLocaleString('vi-VN')}đ`}
                      style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', fontSize: '0.85rem', padding: '0.25rem 0.6rem', cursor: 'help' }}
                    >
                      💥 Giá cuối: {deal.priceAfterCoins.toLocaleString('vi-VN')}đ (Đã áp cộng dồn)
                    </span>
                  ) : null}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Quét lúc: {new Date(deal.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>

                {editingId === deal.id ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <textarea
                      className="form-input"
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      style={{ width: '100%', minHeight: '120px', marginBottom: '0.5rem', fontFamily: 'monospace' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-accent"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => saveCaption(deal.id)}
                        disabled={actionLoadingId === `save-${deal.id}`}
                      >
                        Lưu
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => setEditingId(null)}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="deal-caption-box">{deal.aiCaption}</div>
                    <div className="deal-actions">
                      <button
                        className="btn btn-accent"
                        onClick={() => copyToClipboard(deal.aiCaption)}
                      >
                        📋 Copy Caption (Zalo/Mess)
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => startEditing(deal)}
                      >
                        ✏️ Sửa Caption
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleRegenerate(deal.id)}
                        disabled={actionLoadingId === `regen-${deal.id}`}
                      >
                        {actionLoadingId === `regen-${deal.id}` ? 'Đang tạo...' : '✨ AI Viết Lại'}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSendToTelegram(deal.id)}
                        disabled={actionLoadingId === `send-${deal.id}`}
                      >
                        {actionLoadingId === `send-${deal.id}` ? 'Đang gửi...' : '📤 Gửi Telegram'}
                      </button>
                      <a
                        href={deal.affiliateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ textDecoration: 'none' }}
                      >
                        🔗 Mở Link Shop
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Trang Trước
            </button>
            <span style={{ color: 'var(--text-muted)' }}>Trang {page} / {totalPages}</span>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Trang Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
