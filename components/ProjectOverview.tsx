import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Project, ProjectStatus, Priority, OKR } from '../types';
import { useFilterState } from '../context/FilterStateContext';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { KRFilterButton } from './KRFilterButton';
import { ProjectTable } from './ProjectTable';
import { debounce } from '../utils';

type SortField = 'name' | 'status' | 'priority' | 'createdAt' | 'proposedDate' | 'launchDate';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface ProjectOverviewProps {
  projects: Project[];
  activeOkrs: OKR[];
  allUsers: any[];
  currentUser: any;
  editingId: string | null;
  onCreateProject: () => void;
  onSaveNewProject: (project: Project) => void;
  onUpdateProject: (projectId: string, field: keyof Project, value: any) => void;
  onDeleteProject: (id: string) => void;
  onCancelNewProject: (id: string) => void;
  onOpenModal: (type: 'role' | 'comments' | 'changelog' | 'edit', projectId: string, details?: any) => void;
  onToggleFollow: (projectId: string) => void;
  onAddComment: (projectId: string, text: string) => void;
  onEditProject?: (project: Project) => void;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ 
  projects, 
  activeOkrs, 
  allUsers, 
  currentUser, 
  editingId,
  onCreateProject,
  onSaveNewProject,
  onUpdateProject,
  onDeleteProject,
  onCancelNewProject,
  onOpenModal,
  onToggleFollow,
  onAddComment,
  onEditProject 
}) => {
  // 使用新的状态管理系统
  const { state, updateProjectOverviewFilters } = useFilterState();
  const filters = state.projectOverview;

  // 本地搜索状态（用于即时显示，不触发重新计算）
  const [localSearchTerm, setLocalSearchTerm] = useState(filters.searchTerm);
  
  // 防抖更新搜索词 - 减少防抖时间以提升响应速度
  const debouncedUpdateSearch = useCallback(
    debounce((value: string) => {
      updateProjectOverviewFilters({ searchTerm: value });
    }, 50),
    [updateProjectOverviewFilters]
  );

  // 处理搜索输入变化 - 使用即时搜索提升响应速度
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchTerm(value);
    
    // 对于短搜索词，立即更新；对于长搜索词，使用防抖
    if (value.length <= 2) {
      updateProjectOverviewFilters({ searchTerm: value });
    } else {
      debouncedUpdateSearch(value);
    }
  }, [debouncedUpdateSearch, updateProjectOverviewFilters]);

  // 本地状态处理函数
  const setSelectedStatuses = (value: string[]) => updateProjectOverviewFilters({ selectedStatuses: value });
  const setSelectedPriorities = (value: string[]) => updateProjectOverviewFilters({ selectedPriorities: value });
  const setSelectedParticipants = (value: string[]) => updateProjectOverviewFilters({ selectedParticipants: value });
  const setSelectedKrs = (value: string[]) => updateProjectOverviewFilters({ selectedKrs: value });

  // 从状态中获取当前值
  const searchTerm = filters.searchTerm;
  const selectedStatuses = filters.selectedStatuses || [];
  const selectedPriorities = filters.selectedPriorities || [];
  const selectedParticipants = filters.selectedParticipants || [];
  const selectedKrs = filters.selectedKrs || [];

  // 排序状态 - 使用持久化状态
  const sortConfig = useMemo(() => ({
    field: filters.sortField || 'createdAt',
    direction: filters.sortDirection || 'desc'
  }), [filters.sortField, filters.sortDirection]);

  // 排序函数 - 更新到持久化状态
  const handleSort = (field: SortField) => {
    const newDirection = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    updateProjectOverviewFilters({ 
      sortField: field,
      sortDirection: newDirection
    });
  };

  // 筛选和排序项目 - 使用高效的Set查找方式（参考看板和周会视图）
  const filteredAndSortedProjects = useMemo(() => {
    // 确保项目数组存在且去重（防止重复key错误）
    const uniqueProjects: Project[] = Array.from(
      new Map((projects || []).map(p => [p.id, p])).values()
    );
    
    // 预计算所有筛选集合，使用Set进行O(1)查找
    const statusSet = new Set(selectedStatuses);
    const prioritySet = new Set(selectedPriorities);
    const participantSet = new Set(selectedParticipants);
    const krSet = new Set(selectedKrs);
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // 首先筛选项目
    const filtered = uniqueProjects.filter(project => {
      // 新建的项目（处于编辑状态）始终显示，不受筛选条件影响
      if ((editingId && project.id === editingId) || project.isNew) {
        return true;
      }
      

      
      // 状态筛选 - 使用Set快速查找
      if (statusSet.size > 0 && !statusSet.has(project.status)) {
        return false;
      }
      
      // 优先级筛选 - 使用Set快速查找
      if (prioritySet.size > 0 && !prioritySet.has(project.priority)) {
        return false;
      }
      
      // 参与人筛选 - 使用Set快速查找
      if (participantSet.size > 0) {
        const projectParticipants = new Set([
          ...(project.productManagers || []).map(m => m.userId),
          ...(project.backendDevelopers || []).map(m => m.userId),
          ...(project.frontendDevelopers || []).map(m => m.userId),
          ...(project.qaTesters || []).map(m => m.userId),
        ]);
        
        // 检查是否有交集
        let hasParticipant = false;
        for (const participantId of participantSet) {
          if (projectParticipants.has(participantId)) {
            hasParticipant = true;
            break;
          }
        }
        if (!hasParticipant) return false;
      }
      
      // KR筛选 - 使用Set快速查找
      if (krSet.size > 0) {
        const projectKrs = project.keyResultIds || [];
        const hasMatchingKr = projectKrs.some(krId => krSet.has(krId));
        if (!hasMatchingKr) return false;
      }
      
      // 搜索匹配 - 只搜索项目名称
      if (lowerSearchTerm) {
        const projectName = (project.name || '').toLowerCase();
        
        if (!projectName.includes(lowerSearchTerm)) {
          return false;
        }
      }
      
      return true;
    });

    // 然后排序项目
    return filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortConfig.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-CN');
          break;
        case 'status':
          // 状态排序：按照指定的业务流程顺序
          const statusOrder = {
            '未开始': 0,
            '讨论中': 1,
            '产品设计': 2,
            '需求完成': 3,
            '评审完成': 4,
            '开发中': 5,
            '开发完成': 6,
            '测试中': 7,
            '测试完成': 8,
            '本周已上线': 9,
            '已完成': 10,
            '暂停': 11,
            '项目进行中': 12
          };
          const aStatusOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 999;
          const bStatusOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 999;
          comparison = aStatusOrder - bStatusOrder;
          break;
        case 'priority':
          // 优先级排序：部门OKR > 个人OKR > 临时重要需求 > 不重要的需求
          const priorityOrder = { '部门OKR': 0, '个人OKR': 1, '临时重要需求': 2, '不重要的需求': 3 };
          const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999;
          const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999;
          comparison = aOrder - bOrder;
          break;
        case 'proposedDate':
          // 按提出时间排序
          const aProposedTime = a.proposedDate ? new Date(a.proposedDate).getTime() : 0;
          const bProposedTime = b.proposedDate ? new Date(b.proposedDate).getTime() : 0;
          comparison = bProposedTime - aProposedTime; // 默认倒序（最新的在前）
          break;
        case 'launchDate':
          // 按上线时间排序
          const aLaunchTime = a.launchDate ? new Date(a.launchDate).getTime() : 0;
          const bLaunchTime = b.launchDate ? new Date(b.launchDate).getTime() : 0;
          comparison = bLaunchTime - aLaunchTime; // 默认倒序（最新的在前）
          break;
        case 'createdAt':
        default:
          // 按真正的创建时间排序，使用createdAt字段
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          
          // 如果两个项目的创建时间相同（批量导入的历史数据），则按项目名称排序
          if (aTime === bTime) {
            comparison = a.name.localeCompare(b.name, 'zh-CN');
          } else {
            comparison = bTime - aTime; // 倒序（最新创建的在前）
          }
          break;
      }
      
      return sortConfig.direction === 'asc' ? -comparison : comparison;
    });
  }, [projects, searchTerm, selectedStatuses, selectedPriorities, selectedParticipants, selectedKrs, editingId, sortConfig]);

  // 准备筛选选项
  const statusOptions = Object.values(ProjectStatus).map(status => ({ value: status, label: status }));
  const priorityOptions = Object.values(Priority).map(priority => ({ value: priority, label: priority }));
  
  // 按部门分组参与人选项
  const participantGroupedOptions = useMemo(() => {
    const departmentMap = new Map<string, any[]>();
    
    // 按部门分组
    (allUsers || []).forEach(user => {
      const deptName = user.deptName || '未分配部门';
      if (!departmentMap.has(deptName)) {
        departmentMap.set(deptName, []);
      }
      departmentMap.get(deptName)!.push(user);
    });
    
    // 转换为 groupedOptions 格式并排序
    return Array.from(departmentMap.entries())
      .map(([deptName, users]) => ({
        label: deptName,
        options: users
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
          .map(u => ({ value: u.id, label: u.name, email: u.email }))
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }, [allUsers]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* 固定的搜索和筛选栏 */}
      <div className="flex-shrink-0 p-4 md:p-6 lg:p-8 pb-0">
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* 搜索框 - 缩短至六分之一宽度 */}
            <div className="w-full lg:w-1/6">
              <input
                type="text"
                placeholder="搜索项目名称"
                value={localSearchTerm}
                onChange={handleSearchChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded-md bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* 筛选器 */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <MultiSelectDropdown
                options={statusOptions}
                selectedValues={selectedStatuses}
                onSelectionChange={setSelectedStatuses}
                placeholder="状态"
              />
              <MultiSelectDropdown
                options={priorityOptions}
                selectedValues={selectedPriorities}
                onSelectionChange={setSelectedPriorities}
                placeholder="优先级"
              />
              <MultiSelectDropdown
                groupedOptions={participantGroupedOptions}
                selectedValues={selectedParticipants}
                onSelectionChange={setSelectedParticipants}
                placeholder="参与人"
                userData={allUsers || []}
              />
              <KRFilterButton
                activeOkrs={activeOkrs}
                selectedKrs={selectedKrs}
                setSelectedKrs={setSelectedKrs}
                placeholder="按KR筛选"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 表格区域 */}
      <div className="flex-1 px-4 md:px-6 lg:px-8 pb-4 md:pb-6 lg:pb-8 overflow-hidden">
        <ProjectTable
          projects={filteredAndSortedProjects}
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          currentUser={currentUser}
          editingId={editingId}
          onSaveNewProject={onSaveNewProject}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
          onCancelNewProject={onCancelNewProject}
          onOpenModal={onOpenModal}
          onToggleFollow={onToggleFollow}
          onCreateProject={onCreateProject}
          sortConfig={sortConfig}
          onSort={handleSort}
        />
      </div>
    </main>
  );
};

export default ProjectOverview;