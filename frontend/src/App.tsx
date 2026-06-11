import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Deals } from './components/Deals';
import { Orders } from './components/Orders';
import { Configs } from './components/Configs';
import { ManualShare } from './components/ManualShare';

interface Notification {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [notification, setNotification] = useState<Notification>({
    message: '',
    type: 'success',
    visible: false,
  });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type, visible: true });
  };

  useEffect(() => {
    if (notification.visible) {
      const timer = setTimeout(() => {
        setNotification(prev => ({ ...prev, visible: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.visible]);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-area">
          <span className="logo-icon">🤖</span>
          <span className="logo-text">ToolAffiliate</span>
        </div>

        <nav className="nav-links">
          <li 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'deals' ? 'active' : ''}`}
            onClick={() => setActiveTab('deals')}
          >
            <span className="nav-icon">📋</span>
            <span>Nhật ký Deals</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'manual-share' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual-share')}
          >
            <span className="nav-icon">🔗</span>
            <span>Chia sẻ thủ công</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <span className="nav-icon">📦</span>
            <span>Đơn hàng</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'configs' ? 'active' : ''}`}
            onClick={() => setActiveTab('configs')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Cấu hình</span>
          </li>
        </nav>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 'auto' }}>
          ToolAffiliate v1.0.0 PoC
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {activeTab === 'dashboard' && (
          <Dashboard showNotification={showNotification} setActiveTab={setActiveTab} />
        )}
        {activeTab === 'deals' && (
          <Deals showNotification={showNotification} />
        )}
        {activeTab === 'manual-share' && (
          <ManualShare showNotification={showNotification} />
        )}
        {activeTab === 'orders' && (
          <Orders showNotification={showNotification} />
        )}
        {activeTab === 'configs' && (
          <Configs showNotification={showNotification} />
        )}
      </main>

      {/* Notification Toast */}
      {notification.visible && (
        <div 
          className="notification"
          style={{
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
            border: `1px solid ${notification.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: '#fff',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;
