import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { OKRPage } from './components/OKRPage';
import { KanbanView } from './components/KanbanView';
import { PersonalView } from './components/PersonalView';
import ProjectOverview from './components/ProjectOverview';
import { WeeklyMeetingView } from './components/WeeklyMeetingView';
import { MonthlyMeetingView } from './components/MonthlyMeetingView';
import WeeklyReportView from './components/WeeklyReport';

import { LoadingSpinner } from './components/LoadingSpinner';
import { PersonalViewSkeleton, ProjectOverviewSkeleton, OKRPageSkeleton, KanbanViewSkeleton } from './components/SkeletonLoader';
import { RoleEditModal } from './components/RoleEditModal';
import { CommentModal } from './components/CommentModal';
import { ChangeLogModal } from './components/ChangeLogModal';
import { DocumentModal } from './components/DocumentModal';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { api, apiCache } from './api.ts';
import { Project, ProjectStatus, Role, User, ProjectRoleKey, OKR, Priority, Comment, ChangeLogEntry, OkrSet, Document } from './types';

export type ViewType = 'overview' | 'okr' | 'kanban' | 'personal' | 'weekly' | 'monthly' | 'weeklyReport';

// 根据当前日期确定应该显示的OKR周期
const getCurrentOkrPeriod = (okrSets: OkrSet[]): OkrSet => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  
  // 确定当前是上半年还是下半年
  const isFirstHalf = currentMonth <= 6;
  const expectedPeriodId = `${currentYear}-${isFirstHalf ? 'H1' : 'H2'}`;
  
  // 查找当前期间的OKR
  const currentPeriod = (okrSets || []).find(set => set.periodId === expectedPeriodId);
  if (currentPeriod) {
    return currentPeriod;
  }
  
  // 如果当前期间不存在，查找最近的期间
  const sortedSets = [...okrSets].sort((a, b) => {
    // 解析periodId，例如 "2025-H1" -> {year: 2025, half: 1}
    const parseId = (id: string) => {
      const [year, half] = id.split('-');
      return { year: parseInt(year), half: half === 'H1' ? 1 : 2 };
    };
    
    const aData = parseId(a.periodId);
    const bData = parseId(b.periodId);
    
    if (aData.year !== bData.year) {
      return bData.year - aData.year; // 年份降序
    }
    return bData.half - aData.half; // 半年降序
  });
  
  // 返回最新的OKR周期
  return sortedSets[0];
};

type ModalType = 'role' | 'comments' | 'changelog' | 'documents' | 'edit';
type ModalState = {
  isOpen: boolean;
  type?: ModalType;
  projectId?: string;
  roleKey?: ProjectRoleKey;
  roleName?: string;
  replyToUser?: User;
}

interface AppProps {
  currentUser: User;
}

const App: React.FC<AppProps> = ({ currentUser }) => {
  const [view, setView] = useState<ViewType>('personal');
  const [projects, setProjects] = useState<Project[]>([]);
  const [okrSets, setOkrSets] = useState<OkrSet[]>([]);
  const [currentOkrPeriodId, setCurrentOkrPeriodId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSecondary, setIsLoadingSecondary] = useState(false); // 次要数据加载状态
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false });
  const [newProjectDraft, setNewProjectDraft] = useState<Project | null>(null); // 新建项目草稿
  const [projectDetail, setProjectDetail] = useState<Project | null>(null); // 项目详情（包含变更记录等）

  // 分阶段加载：先加载核心数据（项目），再加载次要数据（OKR、用户）
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
        // 第一阶段：优先加载项目数据（个人视图和项目总览需要）
        console.log('🚀 Phase 1: Loading core data (projects)...');
        const fetchedProjects = await api.fetchProjects();
        setProjects(Array.isArray(fetchedProjects) ? fetchedProjects : []);
        
        // 核心数据加载完成，先让页面可交互
        setIsLoading(false);
        console.log('✅ Phase 1 complete: Projects loaded');
        
        // 第二阶段：后台加载次要数据（OKR、用户）
        setIsLoadingSecondary(true);
        console.log('🚀 Phase 2: Loading secondary data (OKR, users)...');
        
        const [fetchedOkrSets, fetchedUsers] = await Promise.all([
            api.fetchOkrSets(),
            api.fetchUsers()
        ]);
        
        // 防御性处理：确保不为null
        const safeOkrSets = Array.isArray(fetchedOkrSets) ? fetchedOkrSets : [];
        const safeUsers = Array.isArray(fetchedUsers) ? fetchedUsers : [];
        
        setOkrSets(safeOkrSets);
        
        // 设置默认 OKR 周期（仅在初始化时）
        if (safeOkrSets.length > 0 && !currentOkrPeriodId) {
            const currentPeriod = getCurrentOkrPeriod(safeOkrSets);
            setCurrentOkrPeriodId(currentPeriod.periodId);
        }

        setAllUsers(safeUsers);
        console.log('✅ Phase 2 complete: All data loaded');
    } catch (error) {
        console.error("Failed to fetch initial data", error);
    } finally {
        setIsLoading(false);
        setIsLoadingSecondary(false);
    }
  }, []); // 移除 currentOkrPeriodId 依赖，避免重复加载

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeOkrs = useMemo(() => {
    if (!currentOkrPeriodId) return [];
    return (okrSets || []).find(s => s.periodId === currentOkrPeriodId)?.okrs || [];
  }, [okrSets, currentOkrPeriodId]);

  const handleCreateProject = useCallback(() => {
    // 获取当前日期，格式为 YYYY-MM-DD
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const newProject: Project = {
      id: `new_${Date.now()}`,
      name: '',
      priority: Priority.LowPriority,
      status: ProjectStatus.NotStarted,
      businessProblem: '',
      keyResultIds: [],
      weeklyUpdate: '',
      lastWeekUpdate: '',
      productManagers: [],
      backendDevelopers: [],
      frontendDevelopers: [],
      qaTesters: [],
      proposedDate: todayStr, // 默认设置为当前日期
      launchDate: null,
      followers: [],
      comments: [],
      changeLog: [],
      documents: [], // 文档列表
      createdAt: new Date().toISOString(),
      isNew: true,
    };
    
    // 设置为草稿项目并打开编辑弹窗
    setNewProjectDraft(newProject);
    setModalState({ isOpen: true, type: 'edit', projectId: newProject.id });
  }, []);

  const handleUpdateProject = useCallback(async (projectId: string, field: keyof Project, value: any) => {
    const projectToUpdate = (projects || []).find(p => p.id === projectId);
    if (!projectToUpdate) return;
    
    // 当状态选择“本周已上线”或“已完成”时，验证上线时间
    if (field === 'status' && (value === ProjectStatus.LaunchedThisWeek || value === ProjectStatus.Completed)) {
      if (!projectToUpdate.launchDate) {
        alert('选择“本周已上线”或“已完成”状态时，必须填写上线时间！');
        return;
      }
    }
    
    // 优化的值比较逻辑，避免昂贵的JSON.stringify
    const oldValue = projectToUpdate[field];
    const hasChanged = (() => {
      // 对于基本类型，直接比较
      if (typeof oldValue !== 'object' || oldValue === null || typeof value !== 'object' || value === null) {
        return oldValue !== value;
      }
      
      // 对于数组，比较长度和内容
      if (Array.isArray(oldValue) && Array.isArray(value)) {
        if (oldValue.length !== value.length) return true;
        return oldValue.some((item, index) => JSON.stringify(item) !== JSON.stringify(value[index]));
      }
      
      // 对于其他对象，使用JSON.stringify作为后备
      return JSON.stringify(oldValue) !== JSON.stringify(value);
    })();
    
    if (!hasChanged) {
      return; // Do nothing if value hasn't changed.
    }
    
    // 移除KR关联校验限制


    // For new projects (in draft mode), update the draft state.
    if (projectToUpdate.isNew) {
        // Check if this is the draft project
        if (newProjectDraft && newProjectDraft.id === projectId) {
            const updatedDraft = { ...newProjectDraft, [field]: value };
            setNewProjectDraft(updatedDraft);
        } else {
            // Fallback: update in projects array
            const updatedProject = { ...projectToUpdate, [field]: value };
            setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        }
        return;
    }

    // Optimistic Update for existing projects
    const updates: Partial<Project> = { [field]: value };
    
    const loggableFieldLabels: { [K in keyof Project]?: string } = {
        name: '项目名称',
        priority: '优先级',
        status: '状态',
        weeklyUpdate: '本周进展/问题',
        productManagers: '产品经理',
        backendDevelopers: '后端研发',
        frontendDevelopers: '前端研发',
        qaTesters: '测试',
        launchDate: '上线时间',
    };

    const labelForLog = loggableFieldLabels[field];

    if (labelForLog) {
        // 格式化角色字段的显示值
        const formatRoleValue = (roleValue: any): string => {
            if (!Array.isArray(roleValue)) return String(roleValue);
            
            const roleDetails = roleValue.map(member => {
                const user = (allUsers || []).find(u => u.id === member.userId);
                const userName = user ? user.name : '未知用户';
                
                // 包含排期信息 - 优先显示 timeSlots 中的排期
                if (member.timeSlots && member.timeSlots.length > 0) {
                    const slot = member.timeSlots[0];
                    if (slot.startDate && slot.endDate) {
                        const startDateObj = new Date(slot.startDate);
                        const endDateObj = new Date(slot.endDate);
                        if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
                            const startDate = startDateObj.toLocaleDateString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit'
                            }).replace(/\//g, '.');
                            const endDate = endDateObj.toLocaleDateString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit'
                            }).replace(/\//g, '.');
                            return `${userName}(${startDate}~${endDate})`;
                        } else {
                            return `${userName}(无排期)`;
                        }
                    } else {
                        return `${userName}(无排期)`;
                    }
                } else if (member.startDate && member.endDate) {
                    const startDateObj = new Date(member.startDate);
                    const endDateObj = new Date(member.endDate);
                    if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
                        return `${userName}(${member.startDate}~${member.endDate})`;
                    } else {
                        return `${userName}(无排期)`;
                    }
                } else if (member.startDate) {
                    const startDateObj = new Date(member.startDate);
                    if (!isNaN(startDateObj.getTime())) {
                        return `${userName}(${member.startDate}开始)`;
                    } else {
                        return `${userName}(无排期)`;
                    }
                } else {
                    return `${userName}(无排期)`;
                }
            });
            
            return roleDetails.length > 0 ? roleDetails.join(', ') : '无';
        };

        const formatValue = (val: any): string => {
            if (typeof val === 'object' && Array.isArray(val)) {
                // 处理角色数组
                return formatRoleValue(val);
            }
            return String(val);
        };

        const newLogEntry: ChangeLogEntry = {
            id: `cl_${Date.now()}`,
            userId: currentUser!.id,
            field: labelForLog,
            oldValue: formatValue(oldValue),
            newValue: formatValue(value),
            changedAt: new Date().toISOString(),
        };
        updates.changeLog = [newLogEntry, ...(projectToUpdate.changeLog || [])];
    }

    // Optimistically update local state for a responsive UI.
    setProjects(prevProjects => 
        prevProjects.map(p => 
            p.id === projectId ? { ...p, ...updates } : p
        )
    );
    
    // Asynchronously call the API without blocking UI.
    try {
        await api.updateProject(projectId, updates);
        // On success, state is already updated. No full refresh needed.
    } catch (error) {
        console.error("Failed to update project", error);
        // On failure, alert user and revert to the source of truth.
        alert('项目更新失败，正在恢复数据...');
        await fetchData();
    }
  }, [projects, currentUser, fetchData]);

  const handleSaveNewProject = useCallback(async (projectToSave: Project) => {
    // 移除新项目的KR关联校验限制

    try {
        // 优先使用草稿状态中的数据，确保包含所有用户修改
        const finalProjectData = newProjectDraft || projectToSave;

        const creationLogEntry: ChangeLogEntry = {
            id: `cl_${Date.now()}`,
            userId: currentUser!.id,
            field: '项目创建',
            oldValue: '',
            newValue: finalProjectData.name,
            changedAt: new Date().toISOString(),
        };
        const projectWithLog = { 
            ...finalProjectData, 
            changeLog: [creationLogEntry, ...(finalProjectData.changeLog || [])],
            isNew: undefined // 移除 isNew 标记
        };

        // 先关闭弹窗，立即响应用户操作
        setNewProjectDraft(null);
        setEditingId(null);
        handleCloseModal();

        console.log('🚀 Creating project:', projectWithLog.name);
        const result = await api.createProject(projectWithLog);
        console.log('✅ Project created:', result);
        
        // 用服务端返回的数据直接更新本地状态（乐观更新）
        apiCache.delete('projects');
        if (result && result.id) {
            // 移除临时草稿项目，加入服务端返回的正式项目
            setProjects(prev => {
                const filtered = prev.filter(p => p.id !== projectToSave.id);
                return [result, ...filtered];
            });
        } else {
            // 如果服务端没返回完整数据，降级为刷新
            await fetchData();
        }
    } catch (error) {
        console.error("Failed to save new project", error);
        alert('项目创建失败，请重试');
        // 保存失败恢复草稿状态，允许用户重试
        setNewProjectDraft(projectToSave);
    }
  }, [fetchData, currentUser, newProjectDraft]);
  
  const handleCancelNewProject = useCallback((projectId: string) => {
    // 清除草稿状态
    if (newProjectDraft && newProjectDraft.id === projectId) {
        setNewProjectDraft(null);
    }
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setEditingId(null);
    handleCloseModal();
  }, [newProjectDraft]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    // 乐观更新：先从本地状态移除，再调用API
    const deletedProject = projects.find(p => p.id === projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
    
    try {
        await api.deleteProject(projectId);
        apiCache.delete('projects');
    } catch(error) {
        console.error("Failed to delete project", error);
        alert('项目删除失败，正在恢复数据...');
        // 删除失败时恢复本地状态
        if (deletedProject) {
            setProjects(prev => [...prev, deletedProject]);
        } else {
            await fetchData();
        }
    }
  }, [fetchData, projects]);

  const handleEditProject = useCallback((project: Project) => {
    // 打开编辑模态框或设置编辑状态
    handleOpenModal('edit', project.id);
  }, []);

  const handleOpenModal = useCallback(async (type: ModalType, projectId?: string, details: Omit<ModalState, 'isOpen' | 'type' | 'projectId'> = {}) => {
    // 如果是变更记录弹窗，先获取项目详情（包含变更记录）
    if (type === 'changelog' && projectId) {
      try {
        const detail = await api.getProjectDetail(projectId);
        setProjectDetail(detail);
      } catch (error) {
        console.error('Failed to fetch project detail:', error);
      }
    }
    setModalState({ isOpen: true, type, projectId: projectId || '', ...details });
  }, []);

  const handleCloseModal = useCallback((forceClose?: boolean) => {
    // 如果有草稿项目且不是强制关闭，则返回编辑弹窗
    if (newProjectDraft && !forceClose) {
      setModalState({ isOpen: true, type: 'edit', projectId: newProjectDraft.id });
      return;
    }
    setModalState({ isOpen: false });
  }, [newProjectDraft]);
  
  const handleSaveRole = useCallback(async (projectId: string, roleKey: ProjectRoleKey, newRole: Role) => {
     // 检查是否为新项目（草稿模式）
     if (newProjectDraft && newProjectDraft.id === projectId) {
       // 对于草稿项目，更新草稿状态，返回编辑弹窗
       setNewProjectDraft(prev => prev ? { ...prev, [roleKey]: newRole } : prev);
       setModalState({ isOpen: true, type: 'edit', projectId: newProjectDraft.id });
       return;
     }
     
     // 对于现有项目，直接更新，不关闭弹窗（RoleEditModal 保存按钮会调用 onClose 自行关闭）
     await handleUpdateProject(projectId, roleKey, newRole);
  }, [handleUpdateProject, newProjectDraft]);

  const handleUpdateCurrentOkrSet = async (updatedOkrs: OKR[]) => {
    if (!currentOkrPeriodId) return;
    const currentSet = (okrSets || []).find(s => s.periodId === currentOkrPeriodId);
    if (!currentSet) return;

    const updatedSet = { ...currentSet, okrs: updatedOkrs };

    // 乐观更新：先更新本地状态，让UI立即响应
    setOkrSets(prevSets =>
        prevSets.map(s => s.periodId === currentOkrPeriodId ? updatedSet : s)
    );

    // 异步保存到服务器，不阻塞UI
    try {
        await api.updateOkrSet(currentOkrPeriodId, updatedSet);
        // 清除OKR缓存，确保下次获取数据时是最新的
        apiCache.delete('okrSets');
    } catch (error) {
        console.error("Failed to update OKR set", error);
        // 保存失败时提示用户并恢复数据
        alert('OKR保存失败，正在恢复数据...');
        await fetchData();
    }
  };

  const handleCreateNewOkrPeriod = async () => {
    // 筛选正常格式的周期（YYYY-HN格式）并找到最新的
    const validPeriods = okrSets.filter(set => {
        return set.periodId && set.periodId.match(/^\d{4}-H[12]$/);
    });
    
    if (validPeriods.length === 0) {
        console.error("No valid periods found. Cannot create new period.");
        alert("未找到有效的OKR周期，无法创建新周期。");
        return;
    }
    
    // 按年份和半年排序找到最新的周期
    const latestPeriod = validPeriods.sort((a, b) => {
        const [yearA, halfA] = a.periodId.split('-H').map(Number);
        const [yearB, halfB] = b.periodId.split('-H').map(Number);
        if (yearA !== yearB) return yearB - yearA;
        return halfB - halfA;
    })[0];

    const [yearStr, halfStr] = latestPeriod.periodId.split('-H');
    const year = parseInt(yearStr, 10);
    const half = parseInt(halfStr, 10);

    let nextYear = year;
    let nextHalf = half + 1;
    
    if (nextHalf > 2) {
        nextHalf = 1;
        nextYear++;
    }
    
    const nextPeriodId = `${nextYear}-H${nextHalf}`;
    const nextPeriodName = `${nextYear}年${nextHalf === 1 ? '上半年' : '下半年'}`;
    
    // 检查新周期是否已存在
    const existingPeriod = okrSets.find(set => set.periodId === nextPeriodId);
    if (existingPeriod) {
        alert(`周期 ${nextPeriodName} 已存在，无法创建重复周期。`);
        return;
    }

    setIsLoading(true);
    try {
        const newSet = await api.createOkrSet({ periodId: nextPeriodId, periodName: nextPeriodName });
        await fetchData();
        setCurrentOkrPeriodId(newSet.periodId);
    } catch(error) {
        console.error("Failed to create new OKR period", error);
        alert(`创建新周期失败: ${error}`);
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleToggleFollow = useCallback(async (projectId: string) => {
    const project = (projects || []).find(p => p.id === projectId);
    if (!project || !currentUser) return;
    
    const followers = project.followers || [];
    const isFollowing = followers.includes(currentUser.id);
    const newFollowers = isFollowing
        ? followers.filter(id => id !== currentUser.id)
        : [...followers, currentUser.id];
    
    await handleUpdateProject(projectId, 'followers', newFollowers);
  }, [projects, currentUser, handleUpdateProject]);

  const handleAddComment = useCallback(async (projectId: string, text: string, mentions: string[] = []) => {
      const project = (projects || []).find(p => p.id === projectId);
      if (!project || !currentUser) return;

      const newComment: Comment = {
          id: `c_${Date.now()}`,
          userId: currentUser.id,
          text,
          createdAt: new Date().toISOString(),
          mentions,
          readBy: [currentUser.id], // 作者自动标记为已读
      };
      
      const newComments = [...project.comments, newComment];
      await handleUpdateProject(projectId, 'comments', newComments);
      handleCloseModal();
  }, [projects, currentUser, handleUpdateProject, handleCloseModal]);

  const handleReply = useCallback((project: Project, userToReply: User) => {
      handleOpenModal('comments', project.id, { replyToUser: userToReply });
  }, [handleOpenModal]);
  
  // 文档管理函数
  const handleAddDocument = useCallback(async (projectId: string, name: string, url: string) => {
    const project = (projects || []).find(p => p.id === projectId);
    if (!project || !currentUser) return;

    const newDocument: Document = {
      id: `doc_${Date.now()}`,
      name,
      url,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
    };
    
    const newDocuments = [...(project.documents || []), newDocument];
    await handleUpdateProject(projectId, 'documents', newDocuments);
  }, [projects, currentUser, handleUpdateProject]);

  const handleDeleteDocument = useCallback(async (projectId: string, documentId: string) => {
    const project = (projects || []).find(p => p.id === projectId);
    if (!project) return;
    
    const newDocuments = (project.documents || []).filter(doc => doc.id !== documentId);
    await handleUpdateProject(projectId, 'documents', newDocuments);
  }, [projects, handleUpdateProject]);
  
  const currentProjectForModal = (projects || []).find(p => p.id === modalState.projectId);

  const renderView = () => {
    // 个人视图：只要有项目数据就立即渲染，支持分阶段加载
    if (view === 'personal' && (projects || []).length > 0) {
      return (
        <PersonalView
          projects={projects}
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          currentUser={currentUser}
          onUpdateProject={handleUpdateProject}
          onOpenModal={handleOpenModal}
          onToggleFollow={handleToggleFollow}
          onReply={handleReply}
          isLoadingUsers={isLoadingSecondary && allUsers.length === 0}
          isLoadingOkrs={isLoadingSecondary && activeOkrs.length === 0}
        />
      );
    }

    // 显示骨架屏而不是loading spinner
    if (isLoading) {
      switch (view) {
        case 'personal':
          return <PersonalViewSkeleton />;
        case 'overview':
          return <ProjectOverviewSkeleton />;
        case 'okr':
          return <OKRPageSkeleton />;
        case 'kanban':
          return <KanbanViewSkeleton />;
        default:
          return <PersonalViewSkeleton />;
      }
    }

    switch (view) {
      case 'personal':
        return (
          <PersonalView
            projects={projects}
            allUsers={allUsers}
            activeOkrs={activeOkrs}
            currentUser={currentUser}
            onUpdateProject={handleUpdateProject}
            onOpenModal={handleOpenModal}
            onToggleFollow={handleToggleFollow}
            onReply={handleReply}
            isLoadingUsers={isLoadingSecondary && allUsers.length === 0}
            isLoadingOkrs={isLoadingSecondary && activeOkrs.length === 0}
          />
        );
      case 'okr':
        return <OKRPage 
          okrSets={okrSets}
          currentPeriodId={currentOkrPeriodId}
          onPeriodChange={setCurrentOkrPeriodId}
          onUpdateOkrs={handleUpdateCurrentOkrSet}
          onCreateNewPeriod={handleCreateNewOkrPeriod}
        />;
      case 'kanban':
        return (
          <KanbanView 
            projects={projects} 
            allUsers={allUsers} 
            activeOkrs={activeOkrs} 
            onUpdateProject={handleUpdateProject}
            onOpenRoleModal={(roleKey, roleName) => handleOpenModal('role', '', { roleKey, roleName })}
            onToggleFollow={handleToggleFollow}
            currentUser={currentUser}
          />
        );
      case 'weekly':
        return (
            <WeeklyMeetingView
                projects={projects}
                allUsers={allUsers}
                activeOkrs={activeOkrs}
                onOpenModal={handleOpenModal}
                onUpdateProject={handleUpdateProject}
            />
        );
      case 'monthly':
        return (
            <MonthlyMeetingView
                currentUser={currentUser}
            />
        );
      case 'weeklyReport':
        return <WeeklyReportView />;
      case 'overview':
        return (
          <ProjectOverview
            projects={projects}
            activeOkrs={activeOkrs}
            allUsers={allUsers}
            currentUser={currentUser}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onOpenModal={handleOpenModal}
            onToggleFollow={handleToggleFollow}
            onAddComment={handleAddComment}
            onEditProject={handleEditProject}
          />
        );
      default:
        return (
          <MainContent
            projects={projects}
            allUsers={allUsers}
            activeOkrs={activeOkrs}
            currentUser={currentUser}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onOpenModal={handleOpenModal}
            onToggleFollow={handleToggleFollow}
            onAddComment={handleAddComment}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#1A1A1A] text-gray-800 dark:text-gray-300 font-sans">
      <Sidebar view={view} setView={setView} currentUser={currentUser} />
      
      {/* 次要数据加载指示器 */}
      {isLoadingSecondary && (
        <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-3 py-1 rounded-full text-sm shadow-lg flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          加载中...
        </div>
      )}
      
      {renderView()}
      {modalState.isOpen && modalState.type === 'role' && (currentProjectForModal || newProjectDraft) && modalState.roleKey && modalState.roleName && (
        <RoleEditModal
            project={(newProjectDraft || currentProjectForModal)!}
            roleKey={modalState.roleKey}
            roleName={modalState.roleName}
            allUsers={allUsers}
            onClose={handleCloseModal}
            onSave={handleSaveRole}
        />
      )}
      {modalState.isOpen && modalState.type === 'comments' && currentProjectForModal && (
        <CommentModal
          project={currentProjectForModal}
          allUsers={allUsers}
          currentUser={currentUser}
          onClose={handleCloseModal}
          onAddComment={handleAddComment}
          replyToUser={modalState.replyToUser}
        />
      )}
      {modalState.isOpen && modalState.type === 'changelog' && currentProjectForModal && (
          <ChangeLogModal
            project={projectDetail && projectDetail.id === currentProjectForModal.id ? projectDetail : currentProjectForModal}
            allUsers={allUsers}
            onClose={handleCloseModal}
          />
      )}
      {modalState.isOpen && modalState.type === 'documents' && currentProjectForModal && (
        <DocumentModal
          isOpen={true}
          onClose={handleCloseModal}
          documents={currentProjectForModal.documents || []}
          onAddDocument={(name, url) => handleAddDocument(currentProjectForModal.id, name, url)}
          onDeleteDocument={(docId) => handleDeleteDocument(currentProjectForModal.id, docId)}
          projectName={currentProjectForModal.name}
          allUsers={allUsers}
        />
      )}
      {modalState.isOpen && modalState.type === 'edit' && (currentProjectForModal || newProjectDraft) && (
        <ProjectDetailModal
          project={(newProjectDraft || currentProjectForModal)!}
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          currentUser={currentUser}
          isNewProject={!!newProjectDraft}
          onSave={newProjectDraft ? handleSaveNewProject : undefined}
          onClose={() => {
            // 如果是新项目草稿，取消时清除草稿（强制关闭）
            if (newProjectDraft) {
              handleCancelNewProject(newProjectDraft.id);
            } else {
              handleCloseModal(true);
            }
          }}
          onUpdateProject={(projectId, field, value) => {
            if (newProjectDraft && newProjectDraft.id === projectId) {
              // 更新草稿状态
              setNewProjectDraft(prev => prev ? { ...prev, [field]: value } : prev);
            } else {
              // 更新现有项目
              handleUpdateProject(projectId, field, value);
            }
          }}
          onOpenRoleModal={(roleKey, roleName) => {
            // 使用 newProjectDraft 或 modalState.projectId 对应的项目
            const targetProject = newProjectDraft || currentProjectForModal;
            if (targetProject) {
              // 保持编辑弹窗打开，同时打开角色弹窗
              setModalState(prev => ({ 
                ...prev, 
                type: 'role', 
                roleKey, 
                roleName 
              }));
            }
          }}
          onToggleFollow={(projectId) => {
            if (newProjectDraft && newProjectDraft.id === projectId) {
              // 草稿项目不支持关注功能
              return;
            }
            handleToggleFollow(projectId);
          }}
        />
      )}
    </div>
  );
};

export default App;