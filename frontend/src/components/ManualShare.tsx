import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface ManualShareProps {
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const ManualShare: React.FC<ManualShareProps> = ({ showNotification }) => {
  const [productUrl, setProductUrl] = useState('');
  const [isShortLink, setIsShortLink] = useState(false);
  const [parsing, setParsing] = useState(false);
  // Form states
  const [platform, setPlatform] = useState('SHOPEE');
  const [title, setTitle] = useState('');
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [coinAmount, setCoinAmount] = useState<number>(0);
  const [finalPrice, setFinalPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');

  // Result states
  const [saving, setSaving] = useState(false);
  const [aiCaption, setAiCaption] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);

  // State to track values of the last generated AI caption for client-side search-and-replace
  const [lastGeneratedValues, setLastGeneratedValues] = useState({
    title: '',
    originalPrice: 0,
    discountAmount: 0,
    coinAmount: 0,
    finalPrice: 0,
  });

  // Caption edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editCaptionText, setEditCaptionText] = useState('');

  // Post states
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [sendingFacebook, setSendingFacebook] = useState(false);

  // Detect short URL automatically
  useEffect(() => {
    const isShortUrl = /s\.lazada\.vn|shope\.ee|shp\.ee|shopee\.vn\/universal-link/.test(productUrl);
    if (isShortUrl) {
      setIsShortLink(true);
    } else {
      setIsShortLink(false);
    }
  }, [productUrl]);

  // Client-side real-time price & title update in caption as user edits form
  useEffect(() => {
    if (!aiCaption || isEditing) return;

    // String search-and-replace helper with custom formatters to bypass browser locale limits
    const getUpdatedCaption = (
      captionText: string,
      oldVal: typeof lastGeneratedValues,
      newVal: { title: string; originalPrice: number; discountAmount: number; coinAmount: number; finalPrice: number }
    ) => {
      let updated = captionText;

      const formatDot = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const formatComma = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

      // 1. Replace title if changed
      if (oldVal.title && newVal.title && oldVal.title !== newVal.title) {
        updated = updated.replaceAll(oldVal.title, newVal.title);
      }

      // 2. Build mapping of old values to new values for price points
      const priceFields = [
        { old: oldVal.originalPrice, new: newVal.originalPrice },
        { old: oldVal.originalPrice - oldVal.discountAmount, new: newVal.originalPrice - newVal.discountAmount }, // discountPrice
        { old: oldVal.discountAmount, new: newVal.discountAmount },
        { old: oldVal.coinAmount, new: newVal.coinAmount },
        { old: oldVal.finalPrice, new: newVal.finalPrice }
      ];

      for (const item of priceFields) {
        if (item.old !== item.new && item.old > 0) {
          // Replace dot format
          updated = updated.replaceAll(formatDot(item.old), formatDot(item.new));
          // Replace comma format
          updated = updated.replaceAll(formatComma(item.old), formatComma(item.new));
          // Replace raw string
          updated = updated.replaceAll(String(item.old), String(item.new));
        }
      }

      return updated;
    };

    const updated = getUpdatedCaption(aiCaption, lastGeneratedValues, {
      title,
      originalPrice,
      discountAmount,
      coinAmount,
      finalPrice
    });

    if (updated !== aiCaption) {
      setAiCaption(updated);
      setLastGeneratedValues({
        title,
        originalPrice,
        discountAmount,
        coinAmount,
        finalPrice
      });
    }
  }, [title, originalPrice, discountAmount, coinAmount, finalPrice, aiCaption, lastGeneratedValues, isEditing]);

  const handleOriginalPriceChange = (val: number) => {
    setOriginalPrice(val);
    if (discountPercent > 0) {
      const computedAmount = Math.round((val * discountPercent) / 100);
      setDiscountAmount(computedAmount);
      setFinalPrice(Math.max(0, val - computedAmount - coinAmount));
    } else {
      setDiscountPercent(val > 0 ? Math.round((discountAmount / val) * 100) : 0);
      setFinalPrice(Math.max(0, val - discountAmount - coinAmount));
    }
  };

  const handleDiscountAmountChange = (val: number) => {
    setDiscountAmount(val);
    setDiscountPercent(originalPrice > 0 ? Math.round((val / originalPrice) * 100) : 0);
    setFinalPrice(Math.max(0, originalPrice - val - coinAmount));
  };

  const handleDiscountPercentChange = (val: number) => {
    setDiscountPercent(val);
    const computedAmount = Math.round((originalPrice * val) / 100);
    setDiscountAmount(computedAmount);
    setFinalPrice(Math.max(0, originalPrice - computedAmount - coinAmount));
  };

  const handleCoinAmountChange = (val: number) => {
    setCoinAmount(val);
    setFinalPrice(Math.max(0, originalPrice - discountAmount - val));
  };

  const handleParseLink = async () => {
    if (!productUrl.trim()) {
      showNotification('⚠️ Vui lòng nhập đường dẫn sản phẩm', 'error');
      return;
    }

    setParsing(true);
    setAiCaption('');
    setCreatedDealId(null);
    setIsEditing(false);

    try {
      // Step 1: Parse details anonymously (fast, cookie-free)
      const res = await fetch(`${API_BASE}/deals/parse-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl, isShortLink }),
      });

      const data = await res.json();
      if (res.ok) {
        const parsedTitle = data.title || '';
        const parsedOriginalPrice = data.originalPrice || 0;
        
        // Compute discount: if we got discountPrice, discount = original - discount, else 0
        const parsedDiscountPrice = data.discountPrice || parsedOriginalPrice;
        const computedDiscount = Math.max(0, parsedOriginalPrice - parsedDiscountPrice);
        const computedPercent = parsedOriginalPrice > 0 ? Math.round((computedDiscount / parsedOriginalPrice) * 100) : 0;
        const parsedCoinAmount = data.maxCoinsRedeem || 0;
        const computedFinalPrice = Math.max(0, parsedDiscountPrice - parsedCoinAmount);
        const parsedImageUrl = data.imageUrl || '';

        setPlatform(data.platform);
        setTitle(parsedTitle);
        setOriginalPrice(parsedOriginalPrice);
        setDiscountAmount(computedDiscount);
        setDiscountPercent(computedPercent);
        setCoinAmount(parsedCoinAmount);
        setFinalPrice(computedFinalPrice);
        setImageUrl(parsedImageUrl);

        const targetUrl = data.resolvedUrl || productUrl;
        if (data.resolvedUrl && data.resolvedUrl !== productUrl) {
          setProductUrl(data.resolvedUrl);
        }

        showNotification('🔍 Tải thông tin sản phẩm thô thành công!');

        // Step 2: Automatically trigger AI captioning
        await generateCaptionFromValues({
          platform: data.platform,
          originalUrl: targetUrl,
          title: parsedTitle,
          originalPrice: parsedOriginalPrice,
          discountAmount: computedDiscount,
          coinAmount: parsedCoinAmount,
          finalPrice: computedFinalPrice,
          imageUrl: parsedImageUrl
        });
      } else {
        showNotification(`❌ ${data.error || 'Không thể tải thông tin sản phẩm'}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setParsing(false);
    }
  };
  const generateCaptionFromValues = async (payload: {
    platform: string;
    originalUrl: string;
    title: string;
    originalPrice: number;
    discountAmount: number;
    coinAmount: number;
    finalPrice: number;
    imageUrl: string;
  }) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/deals/create-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setAiCaption(data.aiCaption || '');
        setAffiliateUrl(data.affiliateUrl || '');
        setCreatedDealId(data.id);
        
        // Save these values as the reference for client-side editing
        setLastGeneratedValues({
          title: payload.title,
          originalPrice: payload.originalPrice,
          discountAmount: payload.discountAmount,
          coinAmount: payload.coinAmount,
          finalPrice: payload.finalPrice,
        });

        showNotification('✨ Đã viết xong caption bằng AI!');
      } else {
        showNotification(`❌ ${data.error || 'Không thể tạo caption AI'}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showNotification('❌ Lỗi kết nối AI', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateCaptionFromValues({
      platform,
      originalUrl: productUrl,
      title,
      originalPrice,
      discountAmount,
      coinAmount,
      finalPrice,
      imageUrl
    });
  };

  const handleCopyCaption = () => {
    const textToCopy = isEditing ? editCaptionText : aiCaption;
    navigator.clipboard.writeText(textToCopy);
    showNotification('📋 Đã sao chép caption vào clipboard!');
  };

  const handleStartEditing = () => {
    setEditCaptionText(aiCaption);
    setIsEditing(true);
  };

  const handleSaveCaption = async () => {
    if (!createdDealId) return;
    try {
      const res = await fetch(`${API_BASE}/deals/${createdDealId}/caption`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCaption: editCaptionText }),
      });
      if (res.ok) {
        setAiCaption(editCaptionText);
        setIsEditing(false);
        showNotification('💾 Đã lưu thay đổi caption!');
      } else {
        showNotification('❌ Không thể lưu caption', 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    }
  };

  const handleSendToTelegram = async () => {
    if (!createdDealId) return;
    setSendingTelegram(true);
    try {
      const res = await fetch(`${API_BASE}/deals/${createdDealId}/send`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('🚀 ' + data.message);
      } else {
        showNotification('❌ ' + data.error, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleSendToFacebook = async () => {
    if (!createdDealId) return;
    setSendingFacebook(true);
    try {
      const res = await fetch(`${API_BASE}/deals/${createdDealId}/send-facebook`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('📘 ' + data.message);
      } else {
        showNotification('❌ ' + data.error, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setSendingFacebook(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h1>Chia sẻ Link Thủ Công</h1>
          <p>Nhập link sản phẩm để cào thông tin thô ẩn danh (không dùng cookie), tự động viết và cập nhật caption realtime khi bạn sửa giá</p>
        </div>
      </div>

      <div className="dashboard-sections">
        {/* Left column: Entry Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Step 1: Input URL and load */}
          <div className="glass section-card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--primary)' }}>🔗 Bước 1: Nhập link sản phẩm</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://shopee.vn/product/... hoặc https://s.lazada.vn/..."
                  style={{ flexGrow: 1 }}
                  disabled={parsing || saving}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleParseLink}
                  disabled={parsing || saving || !productUrl.trim()}
                  style={{ minWidth: '150px' }}
                >
                  {parsing ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : '🔍 Tải Thông Tin'}
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={isShortLink}
                  onChange={(e) => setIsShortLink(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                  disabled={parsing || saving}
                />
                <span>Đây là Link Rút Gọn (s.lazada.vn, shope.ee, shp.ee...)</span>
              </label>
            </div>
          </div>

          {/* Step 2: Form edit details */}
          <div className="glass section-card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--primary)' }}>📝 Bước 2: Thông tin chi tiết & Giá bán</h3>
            <form onSubmit={handleTriggerManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sàn thương mại</label>
                  <select
                    className="form-select"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    disabled={saving}
                  >
                    <option value="SHOPEE">Shopee</option>
                    <option value="LAZADA">Lazada</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tiêu đề sản phẩm</label>
                  <input
                    type="text"
                    className="form-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Điền tên sản phẩm hiển thị trong bài viết..."
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Giá gốc (đ)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={originalPrice || ''}
                    onChange={(e) => handleOriginalPriceChange(Number(e.target.value))}
                    placeholder="0"
                    required
                    disabled={saving}
                  />
                  {originalPrice > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {originalPrice.toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mức ưu đãi (đ)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={discountAmount || ''}
                    onChange={(e) => handleDiscountAmountChange(Number(e.target.value))}
                    placeholder="0"
                    disabled={saving}
                  />
                  {discountAmount > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {discountAmount.toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mức ưu đãi (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={discountPercent || ''}
                    onChange={(e) => handleDiscountPercentChange(Number(e.target.value))}
                    placeholder="0"
                    min="0"
                    max="100"
                    disabled={saving}
                  />
                  {discountPercent > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Giảm {discountPercent}%
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mức áp xu (đ)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={coinAmount || ''}
                    onChange={(e) => handleCoinAmountChange(Number(e.target.value))}
                    placeholder="0"
                    disabled={saving}
                  />
                  {coinAmount > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {coinAmount.toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0, padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>💰 Mức giá cuối cùng (đ)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>Tự động tính toán (Có thể chỉnh sửa)</span>
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={finalPrice || ''}
                  onChange={(e) => setFinalPrice(Number(e.target.value))}
                  placeholder="0"
                  required
                  disabled={saving}
                  style={{ border: '1px solid var(--primary)' }}
                />
                {finalPrice > 0 && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 'bold', marginTop: '0.25rem', display: 'block' }}>
                    Thực tế người mua trả: {finalPrice.toLocaleString('vi-VN')} đ
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-accent"
                disabled={saving || !productUrl.trim() || !title.trim()}
                style={{ width: '100%', marginTop: '0.5rem', py: '0.85rem', fontSize: '1rem' }}
              >
                {saving ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }}></div>
                    <span>Đang tạo Caption bằng AI & Lưu Deal...</span>
                  </>
                ) : (
                  '✨ AI Viết Lại Caption'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right column: Results and Actions */}
        <div className="glass section-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
          <h3 style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>✨ Kết quả Caption AI</h3>

          {!aiCaption ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px', padding: '2rem' }}>
              <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</span>
              <p>Điền thông tin và bấm nút <strong>Tải Thông Tin</strong> ở form bên trái.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Hệ thống sẽ cào thông tin cơ bản và tự động chạy AI viết caption.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isEditing ? (
                <div>
                  <textarea
                    className="form-input"
                    value={editCaptionText}
                    onChange={(e) => setEditCaptionText(e.target.value)}
                    style={{ width: '100%', minHeight: '220px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-accent" onClick={handleSaveCaption}>
                      💾 Lưu
                    </button>
                    <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="deal-caption-box" style={{ minHeight: '220px', margin: 0, padding: '1.25rem', fontSize: '0.85rem', lineHeight: '1.5' }}>
                    {aiCaption}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={handleStartEditing} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      ✏️ Sửa Caption
                    </button>
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderBottom: '1px solid var(--border)', margin: '0.5rem 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCopyCaption}
                  style={{ width: '100%', py: '0.75rem', fontWeight: 'bold' }}
                >
                  📋 Copy Caption (Zalo/FB/Messenger)
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    className="btn btn-accent"
                    onClick={handleSendToTelegram}
                    disabled={sendingTelegram}
                    style={{ background: '#229ED9', border: 'none', color: '#fff' }}
                  >
                    {sendingTelegram ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : '📤 Gửi Telegram'}
                  </button>

                  <button
                    className="btn btn-accent"
                    onClick={handleSendToFacebook}
                    disabled={sendingFacebook}
                    style={{ background: '#1877F2', border: 'none', color: '#fff' }}
                  >
                    {sendingFacebook ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : '📘 Đăng Facebook'}
                  </button>
                </div>

                <a
                  href={affiliateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                >
                  🔗 Mở Link Affiliate Shop
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
