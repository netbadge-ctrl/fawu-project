// API 配置和接口封装
// 使用环境变量 VITE_API_BASE_URL，未设置时回落到本地默认
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:9000/api';

// 检查是否为开发模式（使用 VITE_APP_ENV 更可靠）
const isDevelopment = import.meta.env.VITE_APP_ENV === 'development' || import.meta.env.DEV || import.meta.env.NODE_ENV === 'development';

console.log('🌐 API_BASE_URL:', API_BASE_URL, '| isDevelopment:', isDevelopment);

// 简单的内存缓存
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

class APICache {
  private cache = new Map<string, CacheItem<unknown>>();
  private readonly TTL = 5 * 60 * 1000; // 5分钟缓存

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  // 清除特定前缀的缓存
  clearPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // 删除特定缓存
  delete(key: string): void {
    this.cache.delete(key);
  }
}

export const apiCache = new APICache();

// 获取JWT token
const getJWTToken = () => {
  return localStorage.getItem('jwt_token');
};

// 统一的请求处理函数
const makeRequest = async (endpoint: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  // 添加JWT认证头（如果存在）
  const jwtToken = getJWTToken();
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    // 如果是401错误，可能需要重新登录
    if (response.status === 401) {
      console.error('JWT token expired or invalid, redirecting to login...');
      // 清除过期的token
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('oidc_user');
      localStorage.removeItem('oidc_token');
      // 重新加载页面触发OIDC登录
      window.location.reload();
      throw new Error('Authentication expired, please log in again');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
};

// API 请求封装
export const api = {
  // 获取用户信息
  async getUser() {
    return makeRequest('/user');
  },

  // 获取用户列表（带缓存）
  async fetchUsers(useCache = true) {
    const cacheKey = 'users';
    
    // 尝试从缓存获取
    if (useCache) {
      const cached = apiCache.get<unknown[]>(cacheKey);
      if (cached) {
        console.log('📦 Using cached users data');
        return cached;
      }
    }
    
    // 开发模式下使用不需要认证的端点
    const endpoint = isDevelopment ? '/dev/users' : '/users';
    const data = await makeRequest(endpoint);
    
    // 防御性处理：确保始终返回数组
    const safeData = Array.isArray(data) ? data : (data ?? []);
    
    // 存入缓存
    apiCache.set(cacheKey, safeData);
    return safeData;
  },

  // 获取项目列表（带缓存）
  async getProjects(useCache = true) {
    const cacheKey = 'projects';
    
    // 尝试从缓存获取
    if (useCache) {
      const cached = apiCache.get<unknown[]>(cacheKey);
      if (cached) {
        console.log('📦 Using cached projects data');
        return cached;
      }
    }
    
    // 开发模式下使用不需要认证的端点
    const endpoint = isDevelopment ? '/dev/projects' : '/projects';
    const data = await makeRequest(endpoint);
    
    // 防御性处理：后端空数据时可能返回null，确保始终返回数组
    const safeData = Array.isArray(data) ? data : (data ?? []);
    
    // 存入缓存
    apiCache.set(cacheKey, safeData);
    return safeData;
  },

  // 获取项目列表（别名）
  async fetchProjects(useCache = true) {
    return this.getProjects(useCache);
  },

  // 获取项目详情（包含变更记录等完整信息）
  async getProjectDetail(projectId: string) {
    const endpoint = isDevelopment ? `/dev/projects/${projectId}` : `/projects/${projectId}`;
    return makeRequest(endpoint);
  },

  // 获取OKR集合（带缓存）
  async fetchOkrSets(useCache = true) {
    const cacheKey = 'okrSets';
    
    // 尝试从缓存获取
    if (useCache) {
      const cached = apiCache.get<unknown[]>(cacheKey);
      if (cached) {
        console.log('📦 Using cached OKR sets data');
        return cached;
      }
    }
    
    // 开发模式下使用不需要认证的端点
    const endpoint = isDevelopment ? '/dev/okr-sets' : '/okr-sets';
    const data = await makeRequest(endpoint);
    
    // 防御性处理：确保始终返回数组
    const safeData = Array.isArray(data) ? data : (data ?? []);
    
    // 存入缓存
    apiCache.set(cacheKey, safeData);
    return safeData;
  },

  // 创建OKR集合
  async createOkrSet(okrSet: any) {
    const endpoint = isDevelopment ? '/dev/okr-sets' : '/okr-sets';
    const result = await makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(okrSet),
    });
    // 清除缓存
    apiCache.delete('okrSets');
    return result;
  },

  // 更新OKR集合
  async updateOkrSet(periodId: string, okrSet: any) {
    const endpoint = isDevelopment ? `/dev/okr-sets/${periodId}` : `/okr-sets/${periodId}`;
    const result = await makeRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(okrSet),
    });
    // 清除缓存
    apiCache.delete('okrSets');
    return result;
  },

  // 执行周度滚动
  async performWeeklyRollover() {
    const endpoint = isDevelopment ? '/dev/perform-weekly-rollover' : '/perform-weekly-rollover';
    return makeRequest(endpoint, {
      method: 'POST',
    });
  },

  // 用户登录
  async login(credentials: any) {
    return makeRequest('/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  // 检查认证状态
  async checkAuth() {
    return makeRequest('/check-auth');
  },

  // OIDC令牌交换
  async oidcTokenExchange(token: any) {
    return makeRequest('/oidc-token', {
      method: 'POST',
      body: JSON.stringify(token),
    });
  },

  // 获取任务列表
  async getTasks() {
    return makeRequest('/tasks');
  },

  // 创建项目
  async createProject(project: any) {
    const endpoint = isDevelopment ? '/dev/projects' : '/projects';
    console.log('📡 API createProject - endpoint:', endpoint, 'isDevelopment:', isDevelopment);
    return makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  // 更新项目
  async updateProject(id: string, project: any) {
    const endpoint = isDevelopment ? `/dev/projects/${id}` : `/projects/${id}`;
    return makeRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(project),
    });
  },

  // 删除项目
  async deleteProject(id: string) {
    const endpoint = isDevelopment ? `/dev/projects/${id}` : `/projects/${id}`;
    return makeRequest(endpoint, {
      method: 'DELETE',
    });
  },

  // 创建任务
  async createTask(task: any) {
    return makeRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  // 更新任务
  async updateTask(id: string, task: any) {
    return makeRequest(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    });
  },

  // 删除任务
  async deleteTask(id: string) {
    return makeRequest(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  // 刷新用户数据
  async refreshUsers() {
    return makeRequest('/refresh-users', {
      method: 'POST',
    });
  },

  // 同步员工数据
  async syncEmployees() {
    return makeRequest('/sync-employees', {
      method: 'POST',
    });
  },

  // AI研究任务相关API
  // 获取所有AI研究任务
  async fetchAIResearchTasks(): Promise<AIResearchTask[]> {
    const endpoint = isDevelopment ? '/dev/ai-research-tasks' : '/ai-research-tasks';
    return makeRequest(endpoint);
  },

  // 创建AI研究任务
  async createAIResearchTask(task: Omit<AIResearchTask, 'id'>): Promise<AIResearchTask> {
    const endpoint = isDevelopment ? '/dev/ai-research-tasks' : '/ai-research-tasks';
    return makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  // 更新AI研究任务
  async updateAIResearchTask(taskId: string, updates: Partial<AIResearchTask>): Promise<void> {
    const endpoint = isDevelopment
      ? `/dev/ai-research-tasks/${taskId}`
      : `/ai-research-tasks/${taskId}`;
    return makeRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // 删除AI研究任务
  async deleteAIResearchTask(taskId: string): Promise<void> {
    const endpoint = isDevelopment
      ? `/dev/ai-research-tasks/${taskId}`
      : `/ai-research-tasks/${taskId}`;
    return makeRequest(endpoint, {
      method: 'DELETE',
    });
  },

  // ================== 周报相关 API ==================

  // 获取周报列表
  async fetchWeeklyReports() {
    const endpoint = isDevelopment ? '/dev/weekly-reports' : '/weekly-reports';
    const data = await makeRequest(endpoint);
    return Array.isArray(data) ? data : [];
  },

  // 获取指定周的周报
  async fetchWeeklyReportByWeek(year: number, week: number) {
    const endpoint = isDevelopment 
      ? `/dev/weekly-reports/${year}/${week}` 
      : `/weekly-reports/${year}/${week}`;
    return makeRequest(endpoint);
  },

  // 生成周报
  async generateWeeklyReport() {
    const endpoint = isDevelopment ? '/dev/weekly-reports/generate' : '/weekly-reports/generate';
    return makeRequest(endpoint, { method: 'POST' });
  },

  // 更新周报
  async updateWeeklyReport(reportId: string, updates: any) {
    const endpoint = isDevelopment 
      ? `/dev/weekly-reports/${reportId}`
      : `/weekly-reports/${reportId}`;
    return makeRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // 重新生成周报（同时将当前内容归档为历史版本）
  async regenerateWeeklyReport(reportId: string) {
    const endpoint = isDevelopment
      ? `/dev/weekly-reports/regenerate/${reportId}`
      : `/weekly-reports/regenerate/${reportId}`;
    return makeRequest(endpoint, { method: 'POST' });
  },

  // 获取周报的历史版本列表
  async fetchWeeklyReportVersions(reportId: string) {
    const endpoint = isDevelopment
      ? `/dev/weekly-reports/versions/${reportId}`
      : `/weekly-reports/versions/${reportId}`;
    const data = await makeRequest(endpoint);
    return Array.isArray(data) ? data : [];
  },

  // 获取某个历史版本的完整内容
  async fetchWeeklyReportVersion(versionId: string) {
    const endpoint = isDevelopment
      ? `/dev/weekly-report-versions/${versionId}`
      : `/weekly-report-versions/${versionId}`;
    return makeRequest(endpoint);
  }
};

export default api;