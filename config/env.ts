// 环境配置管理
export interface AppConfig {
  env: 'development' | 'production';
  apiBaseUrl: string;
  frontendUrl: string;
  enableOIDC: boolean;
  mockUserId?: string;
  oidc: {
    clientId: string;
    clientSecret: string;
    provider: string;
    redirectUri: string;
    scopes: string[];
  };
}

// 获取环境变量，支持默认值
const getEnvVar = (key: string, defaultValue: string = ''): string => {
  return (import.meta as any).env[key] || defaultValue;
};

// 获取布尔类型环境变量
const getBoolEnvVar = (key: string, defaultValue: boolean = false): boolean => {
  const value = getEnvVar(key);
  if (value === '') return defaultValue;
  return value === 'true' || value === '1';
};

// 应用配置
export const appConfig: AppConfig = {
  env: getEnvVar('VITE_APP_ENV', 'development') as 'development' | 'production',
  apiBaseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:9000/api'),
  frontendUrl: getEnvVar('VITE_FRONTEND_URL', 'http://localhost:5173'),
  enableOIDC: getBoolEnvVar('VITE_ENABLE_OIDC', false),
  mockUserId: getEnvVar('VITE_MOCK_USER_ID', '22231'),
  oidc: {
    clientId: 'codebuddy',
    clientSecret: 'e11cda4fdd2f6d24cce9b97feeadd4b4',
    provider: 'https://oidc-public.ksyun.com:443',
    redirectUri: `${getEnvVar('VITE_FRONTEND_URL', 'http://localhost:5173')}/oidc-callback`,
    scopes: ['openid', 'profile', 'email', 'groups', 'departments', 'skip_session']
  }
};

// 开发模式检查
export const isDevelopment = appConfig.env === 'development';
export const isProduction = appConfig.env === 'production';

// 调试信息
if (isDevelopment) {
  console.log('🔧 Development Mode Config:', {
    env: appConfig.env,
    apiBaseUrl: appConfig.apiBaseUrl,
    enableOIDC: appConfig.enableOIDC,
    mockUserId: appConfig.mockUserId
  });
}