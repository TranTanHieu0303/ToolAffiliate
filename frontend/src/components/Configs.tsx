import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  geminiApiKey: string;
  shopeeVietnamAppId: string;
  shopeeVietnamAppSecret: string;
  lazadaAppKey: string;
  lazadaAppSecret: string;
  searchIntervalMinutes: number;
  isScannerActive: boolean;
  isAutoSendTelegram: boolean;
  shopeeAffiliateId: string;
  lazadaAffiliateId: string;
  accessTradeId: string;
  shopeeCookie: string;
  lazadaCookie: string;
  scrapeMethod: string;
  lazadaSearchMethod: string;
  adsenseLinkConvert: boolean;
  promptTemplate: string;
}

interface Keyword {
  id: number;
  keyword: string;
  maxPrice: number | null;
  isActive: boolean;
}

interface ConfigsProps {
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const Configs: React.FC<ConfigsProps> = ({ showNotification }) => {
  const [config, setConfig] = useState<Config>({
    telegramBotToken: '',
    telegramChatId: '',
    geminiApiKey: '',
    shopeeVietnamAppId: '',
    shopeeVietnamAppSecret: '',
    lazadaAppKey: '',
    lazadaAppSecret: '',
    searchIntervalMinutes: 60,
    isScannerActive: true,
    isAutoSendTelegram: true,
    shopeeAffiliateId: '',
    lazadaAffiliateId: '',
    accessTradeId: '',
    shopeeCookie: '',
    lazadaCookie: '',
    scrapeMethod: 'api',
    lazadaSearchMethod: 'catalog',
    adsenseLinkConvert: false,
    promptTemplate: '',
  });

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newMaxPrice, setNewMaxPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingKeywords, setLoadingKeywords] = useState(true);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      showNotification('❌ Lỗi tải cấu hình hệ thống', 'error');
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchKeywords = async () => {
    try {
      const res = await fetch(`${API_BASE}/keywords`);
      if (res.ok) {
        const data = await res.json();
        setKeywords(data);
      }
    } catch (error) {
      console.error('Error fetching keywords:', error);
    } finally {
      setLoadingKeywords(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchKeywords();
  }, []);

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        showNotification('💾 Cấu hình hệ thống đã được cập nhật thành công!');
        fetchConfig();
      } else {
        showNotification('❌ Cập nhật cấu hình thất bại', 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    try {
      const rawMaxPrice = newMaxPrice ? parseFloat(newMaxPrice) : null;
      const res = await fetch(`${API_BASE}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keyword: newKeyword.trim(),
          maxPrice: rawMaxPrice
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('➕ Đã thêm từ khóa mới thành công!');
        setNewKeyword('');
        setNewMaxPrice('');
        fetchKeywords();
      } else {
        showNotification(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    }
  };

  const toggleKeyword = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/keywords/${id}/toggle`, { method: 'PUT' });
      if (res.ok) {
        fetchKeywords();
      }
    } catch (error) {
      showNotification('❌ Không thể đổi trạng thái từ khóa', 'error');
    }
  };

  const deleteKeyword = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/keywords/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('🗑️ Đã xóa từ khóa khỏi danh sách quét!');
        fetchKeywords();
      }
    } catch (error) {
      showNotification('❌ Không thể xóa từ khóa', 'error');
    }
  };

  if (loadingConfig || loadingKeywords) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h1>Thiết Lập Hệ Thống</h1>
          <p>Cấu hình Telegram, API Keys, Prompt mẫu và Danh mục từ khóa quét deal tự động</p>
        </div>
      </div>

      <div className="dashboard-sections" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
        <div>
          <form className="glass section-card" onSubmit={handleConfigSubmit}>
            <h2 className="section-title">Thông Số API & Liên Kết</h2>

            <div className="form-group">
              <label className="form-label">Telegram Bot Token</label>
              <input
                type="password"
                className="form-input"
                value={config.telegramBotToken || ''}
                onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                placeholder="Nhập Token Telegram Bot của bạn"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telegram Chat ID (Group/Channel)</label>
              <input
                type="text"
                className="form-input"
                value={config.telegramChatId || ''}
                onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                placeholder="Ví dụ: -100123456789 hoặc @my_channel"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gemini API Key</label>
              <input
                type="password"
                className="form-input"
                value={config.geminiApiKey || ''}
                onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                placeholder="Nhập API Key từ Google AI Studio"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phương Thức Cào & Tính Giá</label>
              <select
                className="form-input"
                value={config.scrapeMethod || 'api'}
                onChange={(e) => setConfig({ ...config, scrapeMethod: e.target.value })}
              >
                <option value="api">API Scraper (Nhanh, nhẹ, ước lượng voucher)</option>
                <option value="browser">Browser Puppeteer (Chính xác, giả lập trình duyệt)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Phương thức tìm sản phẩm Lazada (Lazada Search Method)</label>
              <select
                className="form-input"
                value={config.lazadaSearchMethod || 'catalog'}
                onChange={(e) => setConfig({ ...config, lazadaSearchMethod: e.target.value })}
              >
                <option value="catalog">Lazada Catalog API (Tìm kiếm sản phẩm từ trang chính Lazada)</option>
                <option value="adsense">Lazada Adsense API (Tìm kiếm từ danh sách chiến dịch Adsense)</option>
                <option value="hybrid">Lazada Hybrid (Tìm trên Lazada chính ➡️ Bọc qua Adsense Link Converter)</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
              <input
                type="checkbox"
                id="adsenseLinkConvert"
                checked={config.adsenseLinkConvert || false}
                onChange={(e) => setConfig({ ...config, adsenseLinkConvert: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="adsenseLinkConvert" className="form-label" style={{ marginBottom: 0, cursor: 'pointer', fontSize: '0.95rem' }}>
                Chuyển đổi mọi link Lazada qua Adsense Link Converter (Dùng Puppeteer)
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Tần Suất Quét (Phút)</label>
              <input
                type="number"
                className="form-input"
                value={config.searchIntervalMinutes}
                onChange={(e) => setConfig({ ...config, searchIntervalMinutes: Number(e.target.value) })}
                min={5}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
              <input
                type="checkbox"
                id="isScannerActive"
                checked={config.isScannerActive}
                onChange={(e) => setConfig({ ...config, isScannerActive: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="isScannerActive" className="form-label" style={{ marginBottom: 0, cursor: 'pointer', fontSize: '0.95rem' }}>
                Tự động quét tìm deal (Active Auto-Scanner)
              </label>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
              <input
                type="checkbox"
                id="isAutoSendTelegram"
                checked={config.isAutoSendTelegram}
                onChange={(e) => setConfig({ ...config, isAutoSendTelegram: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="isAutoSendTelegram" className="form-label" style={{ marginBottom: 0, cursor: 'pointer', fontSize: '0.95rem' }}>
                Tự động gửi deal lên Telegram (Auto-Post to Telegram)
              </label>
            </div>

            <h3 style={{ fontSize: '1rem', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: '2rem 0 1rem 0' }}>
              Tài Khoản Affiliate & Link Hoa Hồng
            </h3>

            <div className="form-group">
              <label className="form-label">AccessTrade ID (Khuyên dùng tại Việt Nam)</label>
              <input
                type="text"
                className="form-input"
                value={config.accessTradeId || ''}
                onChange={(e) => setConfig({ ...config, accessTradeId: e.target.value })}
                placeholder="Ví dụ: 5728492038472912837"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                Nếu cấu hình AccessTrade ID, hệ thống sẽ tự động bọc mọi link Shopee/Lazada qua AccessTrade để bạn nhận được hoa hồng.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Shopee Affiliate ID (Không bắt buộc)</label>
              <input
                type="text"
                className="form-input"
                value={config.shopeeAffiliateId || ''}
                onChange={(e) => setConfig({ ...config, shopeeAffiliateId: e.target.value })}
                placeholder="Ví dụ: 12345678"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lazada Affiliate ID (Không bắt buộc)</label>
              <input
                type="text"
                className="form-input"
                value={config.lazadaAffiliateId || ''}
                onChange={(e) => setConfig({ ...config, lazadaAffiliateId: e.target.value })}
                placeholder="Ví dụ: 98765432"
              />
            </div>

            <h3 style={{ fontSize: '1rem', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: '2rem 0 1rem 0' }}>
              Thông Tin Đăng Nhập / Cookies (Quét deal thật)
            </h3>

            <div className="form-group">
              <label className="form-label">Shopee Session Cookie</label>
              <textarea
                className="form-input"
                value={config.shopeeCookie || ''}
                onChange={(e) => setConfig({ ...config, shopeeCookie: e.target.value })}
                placeholder="Dán chuỗi Cookie của Shopee từ Trình duyệt (F12 -> Network -> Copy Cookie header)"
                style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                Giúp cào thông tin sản phẩm thật trên Shopee mà không bị lỗi 403.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Lazada Session Cookie</label>
              <textarea
                className="form-input"
                value={config.lazadaCookie || ''}
                onChange={(e) => setConfig({ ...config, lazadaCookie: e.target.value })}
                placeholder="Dán chuỗi Cookie của Lazada từ Trình duyệt (F12 -> Network -> Copy Cookie header)"
                style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                Giúp cào thông tin sản phẩm thật trên Lazada Việt Nam.
              </span>
            </div>

            <div style={{
              backgroundColor: 'rgba(52, 152, 219, 0.08)',
              borderLeft: '4px solid var(--primary, #3498db)',
              padding: '1rem',
              borderRadius: '0 6px 6px 0',
              margin: '1rem 0 2rem 0',
              fontSize: '0.85rem',
              color: 'var(--text)',
              lineHeight: '1.45'
            }}>
              <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                💡 Hướng dẫn lấy Cookie từ Trình duyệt (Chrome/Edge/Firefox):
              </strong>
              <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
                <li style={{ marginBottom: '0.25rem' }}>
                  Đối với Shopee, truy cập <a href="https://shopee.vn" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: '600' }}>shopee.vn</a>. Đối với Lazada (đặc biệt khi dùng tính năng bọc link Adsense), bắt buộc truy cập và đăng nhập tại <a href="https://adsense.lazada.vn" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: '600' }}>adsense.lazada.vn</a>.
                </li>
                <li style={{ marginBottom: '0.25rem' }}>
                  Nhấn phím <strong>F12</strong> (hoặc nhấn chuột phải chọn <strong>Kiểm tra/Inspect</strong>) để mở Developer Tools.
                </li>
                <li style={{ marginBottom: '0.25rem' }}>
                  Chọn tab <strong>Console</strong>, gõ lệnh <code>copy(document.cookie)</code> và nhấn <strong>Enter</strong>.
                </li>
                <li style={{ marginBottom: '0.25rem' }}>
                  Cookie của bạn hiện đã được sao chép vào bộ nhớ tạm (Clipboard). Hãy <strong>Paste (Ctrl+V)</strong> trực tiếp vào ô cấu hình tương ứng ở trên.
                </li>
              </ol>
            </div>

            <div className="form-group">
              <label className="form-label">Prompt Mẫu Viết Caption (AI Prompt Template)</label>
              <textarea
                className="form-input"
                value={config.promptTemplate || ''}
                onChange={(e) => setConfig({ ...config, promptTemplate: e.target.value })}
                style={{ minHeight: '220px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                Hỗ trợ các thẻ thay thế: <strong>{"{title}"}</strong>, <strong>{"{originalPrice}"}</strong>, <strong>{"{discountPrice}"}</strong>, <strong>{"{discountPercent}"}</strong>, <strong>{"{platform}"}</strong>, <strong>{"{link}"}</strong>
              </span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Đang lưu...' : '💾 Lưu Cấu Hình'}
            </button>
          </form>
        </div>

        <div>
          <div className="glass section-card">
            <h2 className="section-title">Quản Lý Từ Khóa Quét Deal</h2>
            <form onSubmit={handleAddKeyword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                className="form-input"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Từ khóa (Ví dụ: bàn phím cơ)..."
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                <input
                  type="number"
                  className="form-input"
                  value={newMaxPrice}
                  onChange={(e) => setNewMaxPrice(e.target.value)}
                  placeholder="Giá tối đa mong muốn (đ) (Trống nếu không giới hạn)"
                  style={{ width: '100%', margin: 0 }}
                />
                {newMaxPrice && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: '500' }}>
                    💵 Định dạng: {Number(newMaxPrice).toLocaleString('vi-VN')}đ
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem', alignSelf: 'flex-end' }}>
                Thêm Từ Khóa
              </button>
            </form>

            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Danh sách từ khóa hoạt động:
            </h3>

            {keywords.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                Chưa có từ khóa nào được thiết lập. Hãy nhập để quét deal tự động.
              </p>
            ) : (
              <div className="tag-list">
                {keywords.map((kw) => (
                  <div
                    key={kw.id}
                    className="tag-item"
                    style={{
                      opacity: kw.isActive ? 1 : 0.5,
                      border: kw.isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggleKeyword(kw.id)}
                      title="Click để bật/tắt"
                    >
                      {kw.isActive ? '🟢' : '⚫'} {kw.keyword} {kw.maxPrice ? `(≤ ${kw.maxPrice.toLocaleString('vi-VN')}đ)` : ''}
                    </span>
                    <button
                      type="button"
                      className="tag-delete-btn"
                      onClick={() => deleteKeyword(kw.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
