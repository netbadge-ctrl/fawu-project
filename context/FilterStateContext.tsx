import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

// 筛选条件类型定义
export interface FilterState {
  // 项目列表页筛选条件
  projectList: {
    searchTerm: string;
    selectedStatuses: string[];
    selectedPriorities: string[];
    selectedOwners: string[];
    selectedKrs: string[];
    dateRange: {
      start: string;
      end: string;
    };
    hasComments: boolean;
  };
  
  // 看板视图筛选条件
  kanbanView: {
    selectedUserIds: string[];
    selectedProjectIds: string[];
    selectedKrIds: string[];
    selectedStatuses: string[];
    selectedPriorities: string[];
    granularity: 'week' | 'month';
    viewDate: string;
  };
  
  // 周会视图筛选条件
  weeklyMeeting: {
    searchTerm: string;
    selectedStatuses: string[];
    selectedOwners: string[];
    selectedPriorities: string[];
    selectedKrIds: string[];
    selectedParticipantIds: string[];
    showCompleted: boolean;
  };
  
  // 项目总览筛选条件
  projectOverview: {
    searchTerm: string;
    selectedStatuses: string[];
    selectedPriorities: string[];
    selectedParticipants: string[];
    selectedKrs: string[];
    sortField: 'name' | 'status' | 'priority' | 'createdAt' | 'proposedDate' | 'launchDate';
    sortDirection: 'asc' | 'desc';
    // 多字段排序规则
    multiSortRules: Array<{
      id: string;
      field: 'name' | 'status' | 'priority' | 'keyResults' | 'productManagers' | 'backendDevelopers' | 'frontendDevelopers' | 'qaTesters' | 'createdAt';
      direction: 'asc' | 'desc';
    }>;
    useMultiSort: boolean; // 是否启用多字段排序
  };
  
  // OKR页面筛选条件
  okrPage: {
    searchTerm: string;
    selectedQuarters: string[];
    selectedOwners: string[];
    showArchived: boolean;
  };
}

// 默认筛选状态
const defaultFilterState: FilterState = {
  projectList: {
    searchTerm: '',
    selectedStatuses: [],
    selectedPriorities: [],
    selectedOwners: [],
    selectedKrs: [],
    dateRange: { start: '', end: '' },
    hasComments: false,
  },
  kanbanView: {
    selectedUserIds: [],
    selectedProjectIds: [],
    selectedKrIds: [],
    selectedStatuses: [],
    selectedPriorities: [],
    granularity: 'week' as 'week' | 'month',
    viewDate: new Date().toISOString(),
  },
  weeklyMeeting: {
    searchTerm: '',
    selectedStatuses: [],
    selectedOwners: [],
    selectedPriorities: [],
    selectedKrIds: [],
    selectedParticipantIds: [],
    showCompleted: false,
  },
  projectOverview: {
    searchTerm: '',
    selectedStatuses: [],
    selectedPriorities: [],
    selectedParticipants: [],
    selectedKrs: [],
    sortField: 'createdAt',
    sortDirection: 'desc',
    multiSortRules: [],
    useMultiSort: false,
  },
  okrPage: {
    searchTerm: '',
    selectedQuarters: [],
    selectedOwners: [],
    showArchived: false,
  },
};

// Action类型定义
type FilterAction = 
  | { type: 'UPDATE_PROJECT_LIST_FILTERS'; payload: Partial<FilterState['projectList']> }
  | { type: 'UPDATE_PROJECT_OVERVIEW_FILTERS'; payload: Partial<FilterState['projectOverview']> }
  | { type: 'UPDATE_KANBAN_VIEW_FILTERS'; payload: Partial<FilterState['kanbanView']> }
  | { type: 'UPDATE_WEEKLY_MEETING_FILTERS'; payload: Partial<FilterState['weeklyMeeting']> }
  | { type: 'UPDATE_OKR_PAGE_FILTERS'; payload: Partial<FilterState['okrPage']> }
  | { type: 'RESET_PAGE_FILTERS'; payload: keyof FilterState }
  | { type: 'RESET_ALL_FILTERS' }
  | { type: 'LOAD_PERSISTED_STATE'; payload: FilterState };

// Reducer函数
const filterReducer = (state: FilterState, action: FilterAction): FilterState => {
  switch (action.type) {
    case 'UPDATE_PROJECT_LIST_FILTERS':
      return {
        ...state,
        projectList: { ...state.projectList, ...action.payload }
      };
    
    case 'UPDATE_PROJECT_OVERVIEW_FILTERS':
      return {
        ...state,
        projectOverview: { ...state.projectOverview, ...action.payload }
      };
    
    case 'UPDATE_KANBAN_VIEW_FILTERS':
      return {
        ...state,
        kanbanView: { ...state.kanbanView, ...action.payload }
      };
    
    case 'UPDATE_WEEKLY_MEETING_FILTERS':
      return {
        ...state,
        weeklyMeeting: { ...state.weeklyMeeting, ...action.payload }
      };
    
    case 'UPDATE_OKR_PAGE_FILTERS':
      return {
        ...state,
        okrPage: { ...state.okrPage, ...action.payload }
      };
    
    case 'RESET_PAGE_FILTERS':
      return {
        ...state,
        [action.payload]: defaultFilterState[action.payload]
      };
    
    case 'RESET_ALL_FILTERS':
      return defaultFilterState;
    
    case 'LOAD_PERSISTED_STATE':
      return action.payload;
    
    default:
      return state;
  }
};

// Context类型定义
interface FilterStateContextType {
  state: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  updateProjectListFilters: (filters: Partial<FilterState['projectList']>) => void;
  updateProjectOverviewFilters: (filters: Partial<FilterState['projectOverview']>) => void;
  updateKanbanViewFilters: (filters: Partial<FilterState['kanbanView']>) => void;
  updateWeeklyMeetingFilters: (filters: Partial<FilterState['weeklyMeeting']>) => void;
  updateOkrPageFilters: (filters: Partial<FilterState['okrPage']>) => void;
  resetPageFilters: (page: keyof FilterState) => void;
  resetAllFilters: () => void;
}

// 创建Context
const FilterStateContext = createContext<FilterStateContextType | undefined>(undefined);

// 本地存储键名
const STORAGE_KEY = 'codebuddy_filter_state';

// 持久化工具函数
const saveToStorage = (state: FilterState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save filter state to localStorage:', error);
  }
};

const loadFromStorage = (): FilterState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 验证数据结构完整性
      if (parsed && typeof parsed === 'object') {
        return { ...defaultFilterState, ...parsed };
      }
    }
  } catch (error) {
    console.warn('Failed to load filter state from localStorage:', error);
  }
  return null;
};

// Provider组件
interface FilterStateProviderProps {
  children: ReactNode;
}

export const FilterStateProvider: React.FC<FilterStateProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(filterReducer, defaultFilterState);

  // 初始化时从localStorage加载状态
  useEffect(() => {
    const persistedState = loadFromStorage();
    if (persistedState) {
      dispatch({ type: 'LOAD_PERSISTED_STATE', payload: persistedState });
    }
  }, []);

  // 状态变化时保存到localStorage
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  // 便捷方法
  const updateProjectListFilters = (filters: Partial<FilterState['projectList']>) => {
    dispatch({ type: 'UPDATE_PROJECT_LIST_FILTERS', payload: filters });
  };

  const updateProjectOverviewFilters = (filters: Partial<FilterState['projectOverview']>) => {
    dispatch({ type: 'UPDATE_PROJECT_OVERVIEW_FILTERS', payload: filters });
  };

  const updateKanbanViewFilters = (filters: Partial<FilterState['kanbanView']>) => {
    dispatch({ type: 'UPDATE_KANBAN_VIEW_FILTERS', payload: filters });
  };

  const updateWeeklyMeetingFilters = (filters: Partial<FilterState['weeklyMeeting']>) => {
    dispatch({ type: 'UPDATE_WEEKLY_MEETING_FILTERS', payload: filters });
  };

  const updateOkrPageFilters = (filters: Partial<FilterState['okrPage']>) => {
    dispatch({ type: 'UPDATE_OKR_PAGE_FILTERS', payload: filters });
  };

  const resetPageFilters = (page: keyof FilterState) => {
    dispatch({ type: 'RESET_PAGE_FILTERS', payload: page });
  };

  const resetAllFilters = () => {
    dispatch({ type: 'RESET_ALL_FILTERS' });
  };

  const contextValue: FilterStateContextType = {
    state,
    dispatch,
    updateProjectListFilters,
    updateProjectOverviewFilters,
    updateKanbanViewFilters,
    updateWeeklyMeetingFilters,
    updateOkrPageFilters,
    resetPageFilters,
    resetAllFilters,
  };

  return (
    <FilterStateContext.Provider value={contextValue}>
      {children}
    </FilterStateContext.Provider>
  );
};

// Hook for using the context
export const useFilterState = (): FilterStateContextType => {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState must be used within a FilterStateProvider');
  }
  return context;
};

// 选择器Hook - 用于获取特定页面的筛选状态
export const usePageFilters = (page: keyof FilterState) => {
  const { state } = useFilterState();
  return state[page];
};

// 性能优化Hook - 只在特定筛选条件变化时重新渲染
export const useFilterSelector = <T,>(selector: (state: FilterState) => T): T => {
  const { state } = useFilterState();
  return selector(state);
};