import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface Order {
  id: string;
  platform: string;
  purchaseTime: string;
  orderValue: number;
  commission: number;
  status: string;
  productName: string;
}

interface OrdersProps {
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const Orders: React.FC<OrdersProps> = ({ showNotification }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      showNotification('❌ Lỗi tải danh sách đơn hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    const matchesPlatform = filterPlatform ? o.platform === filterPlatform : true;
    const matchesStatus = filterStatus ? o.status === filterStatus : true;
    return matchesPlatform && matchesStatus;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h1>Danh Sách Đơn Hàng</h1>
          <p>Danh sách các giao dịch mua hàng phát sinh qua link affiliate của bạn</p>
        </div>
      </div>

      <div className="glass section-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sàn:</label>
          <select 
            className="form-input" 
            style={{ padding: '0.4rem 0.8rem', minWidth: '120px' }}
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="SHOPEE">Shopee</option>
            <option value="LAZADA">Lazada</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Trạng thái:</label>
          <select 
            className="form-input" 
            style={{ padding: '0.4rem 0.8rem', minWidth: '120px' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="COMPLETED">Thành công</option>
            <option value="PENDING">Chờ xử lý</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '30vh' }}>
          <div className="spinner"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
        </div>
      ) : (
        <div className="glass table-container" style={{ padding: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Mã Đơn Hàng</th>
                <th>Sàn</th>
                <th>Tên Sản Phẩm</th>
                <th>Giá Trị</th>
                <th>Hoa Hồng</th>
                <th>Thời Gian</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((ord) => (
                <tr key={ord.id}>
                  <td style={{ fontWeight: 'bold' }}>{ord.id}</td>
                  <td>
                    <span className={`badge ${ord.platform === 'SHOPEE' ? 'badge-warning' : 'badge-info'}`}>
                      {ord.platform}
                    </span>
                  </td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ord.productName}
                  </td>
                  <td>{ord.orderValue.toLocaleString('vi-VN')}đ</td>
                  <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                    {ord.commission.toLocaleString('vi-VN')}đ
                  </td>
                  <td>{new Date(ord.purchaseTime).toLocaleString('vi-VN')}</td>
                  <td>
                    <span className={`badge ${
                      ord.status === 'COMPLETED' ? 'badge-success' : 
                      ord.status === 'PENDING' ? 'badge-warning' : 'badge-danger'
                    }`}>
                      {ord.status === 'COMPLETED' ? 'Thành công' : ord.status === 'PENDING' ? 'Chờ xử lý' : 'Đã hủy'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
