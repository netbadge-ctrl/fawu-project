import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import { AuthProvider } from './context/auth-context';
import { useAuth } from './context/auth-context';
import { startOIDCLogin } from './context/auth-context';
import { ThemeProvider } from './context/theme-context';
import { FilterStateProvider } from './context/FilterStateContext';
import { LoadingSpinner } from './components/LoadingSpinner';
import OIDCCallback from './components/OIDCCallback';
import { appConfig } from './config/env';
import { isDevelopment } from './config/env';

const AppGate: React.FC = () => {
    const authData = useAuth();
    const user = authData.user;
    const isLoading = authData.isLoading;
    const isAuthenticated = authData.isAuthenticated;

    // 检查是否是OIDC回调页面
    if (window.location.pathname === '/oidc-callback') {
        return <OIDCCallback />;
    }

    if (isLoading) {
        return <LoadingSpinner />;
    }

    // 如果未认证，根据环境配置决定处理方式
    if (!isAuthenticated) {
        // 开发模式：等待 AuthProvider 自动加载模拟用户
        // 直接使用 import.meta.env 而不是 appConfig，避免构建后被静态替换
        const viteEnv = (import.meta as any).env.VITE_APP_ENV || 'development';
        const viteEnableOIDC = (import.meta as any).env.VITE_ENABLE_OIDC === 'true';
        const isDevMode = viteEnv === 'development';
        
        console.log('🔍 AppGate check - VITE_APP_ENV:', viteEnv, 'VITE_ENABLE_OIDC:', (import.meta as any).env.VITE_ENABLE_OIDC, 'isDevMode:', isDevMode, 'viteEnableOIDC:', viteEnableOIDC);
        
        if (isDevMode && !viteEnableOIDC) {
            // 显示加载中，等待 AuthProvider 完成模拟用户认证
            console.log('🔧 AppGate: Development mode without OIDC, waiting for mock auth...');
            return <LoadingSpinner />;
        }
        
        // 生产模式或OIDC启用：跳转到OIDC登录
        console.log('🔐 AppGate: Redirecting to OIDC login');
        startOIDCLogin();
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400">
                Redirecting to OIDC login...
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-[#1A1A1A] text-red-500">
                Error: Unable to load user data.
            </div>
        );
    }

    return <App currentUser={user} />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ThemeProvider>
    <AuthProvider>
      <FilterStateProvider>
        <AppGate />
      </FilterStateProvider>
    </AuthProvider>
  </ThemeProvider>
);