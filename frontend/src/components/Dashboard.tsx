import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  totalCommission: number;
  dealsSentCount: number;
  recentOrders: Array<{
    id: string;
    platform: string;
    productName: string;
    orderValue: number;
    commission: number;
    status: string;
    purchaseTime: string;
  }>;
  recentDeals: Array<{
    id: string;
    platform: string;
    title: string;
    imageUrl: string;
    originalPrice: number;
    discountPrice: number;
    status: string;
    createdAt: string;
  }>;
  chart: {
    labels: string[];
    commission: number[];
    orders: number[];
  };
}

interface DashboardProps {
  showNotification: (msg: string, type?: 'success' | 'error') => void;
  setActiveTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ showNotification, setActiveTab }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [generatingMock, setGeneratingMock] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const triggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/deals/trigger-scan`, { method: 'POST' });
      if (res.ok) {
        showNotification('🚀 Đã bắt đầu quét và gửi deal mới lên Telegram!');
        setTimeout(fetchStats, 3000);
      } else {
        showNotification('❌ Có lỗi xảy ra khi quét deal', 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setScanning(false);
    }
  };

  const generateMockData = async () => {
    setGeneratingMock(true);
    try {
      const res = await fetch(`${API_BASE}/orders/generate-mock`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification(`🎉 ${data.message}`);
        fetchStats();
      } else {
        showNotification(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification('❌ Lỗi kết nối đến backend', 'error');
    } finally {
      setGeneratingMock(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const chartMaxCommission = stats?.chart.commission.length 
    ? Math.max(...stats.chart.commission, 1) 
    : 1;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h1>Tổng Quan Hệ Thống</h1>
          <p>Theo dõi hiệu suất tìm deal tự động và doanh thu affiliate</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={generateMockData} 
            disabled={generatingMock || (stats ? stats.totalOrders > 0 : false)}
          >
            {generatingMock ? 'Đang tạo...' : 'Tạo đơn ảo (Để Test)'}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={triggerScan} 
            disabled={scanning}
          >
            {scanning ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : '🔍 Quét Deal Ngay'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass stat-card">
          <div className="stat-header">
            <span>TỔNG ĐƠN HÀNG</span>
            <span className="stat-icon">📦</span>
          </div>
          <div className="stat-value">{stats?.totalOrders || 0}</div>
          <div className="stat-desc">Đơn phát sinh qua hệ thống</div>
        </div>

        <div className="glass stat-card">
          <div className="stat-header">
            <span>GIÁ TRỊ ĐƠN</span>
            <span className="stat-icon">💰</span>
          </div>
          <div className="stat-value">{(stats?.totalRevenue || 0).toLocaleString('vi-VN')}đ</div>
          <div className="stat-desc">Doanh số Shopee & Lazada</div>
        </div>

        <div className="glass stat-card" style={{ boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.1)' }}>
          <div className="stat-header">
            <span style={{ color: 'var(--accent)' }}>HOA HỒNG NHẬN</span>
            <span className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)' }}>📈</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {(stats?.totalCommission || 0).toLocaleString('vi-VN')}đ
          </div>
          <div className="stat-desc">Doanh thu tạm tính của bạn</div>
        </div>

        <div className="glass stat-card">
          <div className="stat-header">
            <span>DEAL ĐÃ GỬI</span>
            <span className="stat-icon">📤</span>
          </div>
          <div className="stat-value">{stats?.dealsSentCount || 0}</div>
          <div className="stat-desc">Đã post thành công lên Telegram</div>
        </div>
      </div>

      <div className="dashboard-sections">
        <div>
          <div className="glass section-card">
            <h2 className="section-title">Doanh Thu Hoa Hồng (6 Tháng Qua)</h2>
            <div className="mini-chart">
              {stats?.chart.labels.map((label, idx) => {
                const val = stats.chart.commission[idx] || 0;
                const heightPct = Math.max(10, Math.min(100, (val / chartMaxCommission) * 100));
                return (
                  <div 
                    key={label} 
                    className="mini-chart-bar" 
                    style={{ height: `${heightPct}%` }}
                  >
                    <div className="mini-chart-bar-tooltip">
                      {val.toLocaleString('vi-VN')}đ
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mini-chart-labels">
              {stats?.chart.labels.map(l => <span key={l}>{l}</span>)}
            </div>
          </div>

          <div className="glass section-card">
            <div className="section-title">
              <h2>Đơn Hàng Gần Đây</h2>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setActiveTab('orders')}>
                Xem tất cả
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Đơn Hàng</th>
                    <th>Sàn</th>
                    <th>Sản Phẩm</th>
                    <th>Giá Trị</th>
                    <th>Hoa Hồng</th>
                    <th>Trạng Thái</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        Chưa có đơn hàng nào. Hãy ấn nút "Tạo đơn ảo" để thử nghiệm dashboard.
                      </td>
                    </tr>
                  ) : (
                    stats?.recentOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td style={{ fontWeight: 'bold' }}>{ord.id}</td>
                        <td>
                          <span className={`badge ${ord.platform === 'SHOPEE' ? 'badge-warning' : 'badge-info'}`}>
                            {ord.platform}
                          </span>
                        </td>
                        <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ord.productName}
                        </td>
                        <td>{ord.orderValue.toLocaleString('vi-VN')}đ</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                          {ord.commission.toLocaleString('vi-VN')}đ
                        </td>
                        <td>
                          <span className={`badge ${
                            ord.status === 'COMPLETED' ? 'badge-success' : 
                            ord.status === 'PENDING' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {ord.status === 'COMPLETED' ? 'Thành công' : ord.status === 'PENDING' ? 'Chờ xử lý' : 'Đã hủy'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="glass section-card" style={{ height: '100%' }}>
            <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Deal Mới Quét</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {stats?.recentDeals.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                  Chưa quét deal nào. Nhấp "Quét Deal Ngay" ở góc trên bên phải để bắt đầu.
                </div>
              ) : (
                stats?.recentDeals.map((deal) => (
                  <div key={deal.id} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                    <img 
                      src={deal.imageUrl || 'https://placehold.co/100'} 
                      alt="" 
                      style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, minWidth: 0 }}>
                      <h4 style={{ 
                        fontSize: '0.9rem', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        margin: 0
                      }}>
                        {deal.title}
                      </h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {deal.discountPrice.toLocaleString('vi-VN')}đ
                        </span>
                        <span className={`badge ${deal.status === 'SENT' ? 'badge-success' : 'badge-warning'}`}>
                          {deal.status === 'SENT' ? 'Đã gửi' : 'Chờ gửi'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {stats?.recentDeals.length ? (
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', marginTop: '1.5rem' }}
                onClick={() => setActiveTab('deals')}
              >
                Xem tất cả deal
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
