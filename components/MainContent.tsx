import React, { useState, useMemo } from 'react';
import { ProjectTable } from './ProjectTable';
import { FilterBar } from './FilterBar';
import { Project, ProjectStatus, Role, User, ProjectRoleKey, OKR, Priority } from '../types';
import { fuzzySearch } from '../utils';
import { IconPlus } from './Icons';
import { useFilterState } from '../context/FilterStateContext';


interface MainContentProps {
  projects: Project[];
  allUsers: User[];
  activeOkrs: OKR[];
  currentUser: User;
  onCreateProject: () => void;
  onUpdateProject: (projectId: string, field: keyof Project, value: any) => void;
  onDeleteProject: (id: string) => void;
  onOpenModal: (type: 'role' | 'comments' | 'changelog' | 'edit', projectId: string, details?: any) => void;
  onToggleFollow: (projectId: string) => void;
  onAddComment: (projectId: string, text: string) => void;
}


export const MainContent: React.FC<MainContentProps> = (props) => {
  const {
    projects: originalProjects, allUsers, activeOkrs, currentUser, onCreateProject,
    onUpdateProject, onDeleteProject, onOpenModal, onToggleFollow, onAddComment
  } = props;

  // 使用本地模拟数据，避免网络请求错误
  const projects = originalProjects.length > 0 ? originalProjects : [
    {
      id: '1',
      name: 'OMS网络类移动端设计',
      businessBackground: '1.预约设备上线，支持预约功能模块，引导客户自助分配配置',
      status: '进行中' as ProjectStatus,
      priority: '高' as Priority,
      weeklyUpdate: 'N/A',
      lastWeekUpdate: '第三方代发功能模块开发完成，正在进行测试和优化。遇到的主要问题包括：1）代发门类设置前端人员登录问题；2）自动分配位置不符合销售预期。下周计划完成测试并上线。',
      roles: {} as Record<ProjectRoleKey, string[]>,
      followers: [],
      comments: [],
      changelog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // 使用新的状态管理系统
  const { state, updateProjectListFilters } = useFilterState();
  const filters = state.projectList;

  // 为了兼容现有的FilterBar组件，创建setter函数
  const setSearchTerm = (value: string) => updateProjectListFilters({ searchTerm: value });
  const setSelectedStatuses = (value: string[]) => updateProjectListFilters({ selectedStatuses: value });
  const setSelectedPriorities = (value: string[]) => updateProjectListFilters({ selectedPriorities: value });
  const setSelectedOwners = (value: string[]) => updateProjectListFilters({ selectedOwners: value });
  const setSelectedKrs = (value: string[]) => updateProjectListFilters({ selectedKrs: value });

  // 从状态中获取当前值
  const searchTerm = filters.searchTerm;
  const selectedStatuses = filters.selectedStatuses;
  const selectedPriorities = filters.selectedPriorities;
  const selectedOwners = filters.selectedOwners;
  const selectedKrs = filters.selectedKrs;

  const keyResultToOkrMap = useMemo(() => {
    const map = new Map<string, string>();
    activeOkrs.forEach(okr => {
        okr.keyResults.forEach(kr => {
            map.set(kr.id, okr.id);
        });
    });
    return map;
  }, [activeOkrs]);

  const filteredAndSortedProjects = useMemo(() => {
    const filtered = projects.filter(project => {
        // 新建项目始终显示，不受任何条件影响
        if (project && project.isNew) {
            return true;
        }

        // 确保项目数据完整性
        if (!project || !project.name) {
            return false;
        }

        // Search Term
        if (searchTerm && searchTerm.trim() && !fuzzySearch(searchTerm.trim(), project.name)) {
            return false;
        }

        // Status
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(project.status)) {
            return false;
        }

        // Priority
        if (selectedPriorities.length > 0 && !selectedPriorities.includes(project.priority)) {
            return false;
        }

        // Owners - 确保数组存在且不为空
        if (selectedOwners.length > 0) {
            const owners = project.owners || [];
            if (!owners.some(m => m && m.userId && selectedOwners.includes(m.userId))) {
                return false;
            }
        }

        // KRs - 确保数组存在且不为空
        if (selectedKrs.length > 0) {
            const keyResultIds = project.keyResultIds || [];
            const selectedKrSet = new Set(selectedKrs);
            if (!keyResultIds.some(krId => krId && selectedKrSet.has(krId))) {
                return false;
            }
        }

        return true;
    });

    const priorityOrder: Record<Priority, number> = {
        [Priority.DeptOKR]: 0,
        [Priority.PersonalOKR]: 1,
        [Priority.UrgentRequirement]: 2,
        [Priority.LowPriority]: 3,
    };

    const statusOrder: Partial<Record<ProjectStatus, number>> = {
        [ProjectStatus.NotStarted]: 0,
        [ProjectStatus.Discussion]: 1,
        [ProjectStatus.RequirementsDone]: 2,
        [ProjectStatus.ReviewDone]: 3,
        [ProjectStatus.ProductDesign]: 4,
        [ProjectStatus.InProgress]: 5,
        [ProjectStatus.DevDone]: 6,
        [ProjectStatus.Testing]: 7,
        [ProjectStatus.TestDone]: 8,
        [ProjectStatus.LaunchedThisWeek]: 9,
        [ProjectStatus.Completed]: 10,
        [ProjectStatus.Paused]: 11,
        [ProjectStatus.ProjectInProgress]: 12,
    };
    
    return filtered.sort((a, b) => {
        // 新项目始终排在最前面
        if (a.isNew && !b.isNew) return -1;
        if (!a.isNew && b.isNew) return 1;
        
        const priorityA = priorityOrder[a.priority];
        const priorityB = priorityOrder[b.priority];
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        const getOkrId = (project: Project) => {
            const keyResultIds = project.keyResultIds || [];
            if (keyResultIds.length > 0) {
                return keyResultToOkrMap.get(keyResultIds[0]) || 'zzzz';
            }
            return 'zzzz';
        };

        const okrA = getOkrId(a);
        const okrB = getOkrId(b);

        if (okrA.localeCompare(okrB) !== 0) {
            return okrA.localeCompare(okrB);
        }

        const statusA = statusOrder[a.status];
        const statusB = statusOrder[b.status];
        return statusA - statusB;
    });

  }, [projects, searchTerm, selectedStatuses, selectedPriorities, selectedOwners, selectedKrs, keyResultToOkrMap]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto flex flex-col gap-6">
        <FilterBar
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          selectedPriorities={selectedPriorities}
          setSelectedPriorities={setSelectedPriorities}
          selectedOwners={selectedOwners}
          setSelectedOwners={setSelectedOwners}
          selectedKrs={selectedKrs}
          setSelectedKrs={setSelectedKrs}

        />
        <ProjectTable
          projects={filteredAndSortedProjects}
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          currentUser={currentUser}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
          onOpenModal={onOpenModal}
          onToggleFollow={onToggleFollow}
          onCreateProject={onCreateProject}
        />
      </div>
    </main>
  );
};