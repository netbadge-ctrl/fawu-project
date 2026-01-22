import React, { useMemo } from 'react';
import { Project, User, ProjectStatus, Priority, OKR } from '../types';
import { WeeklyMeetingProjectCard } from './WeeklyMeetingProjectCard';
import { WeeklyMeetingFilterBar } from './WeeklyMeetingFilterBar';
import { useFilterState } from '../context/FilterStateContext';
import { SYSTEM_OPTIONS } from '../constants';

interface WeeklyMeetingViewProps {
    projects: Project[];
    allUsers: User[];
    activeOkrs: OKR[];
    onOpenModal: (type: 'comments', projectId: string, details?: any) => void;
    onUpdateProject?: (projectId: string, field: keyof Project, value: any) => void;
}

export const WeeklyMeetingView: React.FC<WeeklyMeetingViewProps> = ({ projects, allUsers, activeOkrs, onOpenModal, onUpdateProject }) => {
    // 使用新的状态管理系统
    const { state, updateWeeklyMeetingFilters } = useFilterState();
    const filters = state.weeklyMeeting;

    // 本地状态处理函数
    const setSelectedPriorities = (value: string[]) => updateWeeklyMeetingFilters({ selectedPriorities: value });
    const setSelectedSystems = (value: string[]) => updateWeeklyMeetingFilters({ selectedSystems: value });
    const setSelectedKrIds = (value: string[]) => updateWeeklyMeetingFilters({ selectedKrIds: value });
    const setSelectedParticipantIds = (value: string[]) => updateWeeklyMeetingFilters({ selectedParticipantIds: value });
    const setSelectedStatuses = (value: string[]) => updateWeeklyMeetingFilters({ selectedStatuses: value });

    // 从状态中获取当前值,添加默认值保护
    const selectedPriorities = filters.selectedPriorities || [];
    const selectedSystems = filters.selectedSystems || [];
    const selectedKrIds = filters.selectedKrIds || [];
    const selectedParticipantIds = filters.selectedParticipantIds || [];
    const selectedStatuses = filters.selectedStatuses || [];

    const keyResultToOkrMap = useMemo(() => {
        const map = new Map<string, string>();
        (activeOkrs || []).forEach(okr => {
            (okr.keyResults || []).forEach(kr => {
                map.set(kr.id, okr.id);
            });
        });
        return map;
    }, [activeOkrs]);

    const filteredAndSortedProjects = useMemo(() => {
        // 1. Initial filter for active projects
        let filteredProjects = (projects || []).filter(p => 
            p.status !== ProjectStatus.Completed && 
            p.status !== ProjectStatus.NotStarted &&
            p.status !== ProjectStatus.Paused
        );

        // 2. Apply UI filters
        filteredProjects = filteredProjects.filter(project => {
            if (selectedPriorities.length > 0 && !selectedPriorities.includes(project.priority)) {
                return false;
            }
            if (selectedStatuses.length > 0 && !selectedStatuses.includes(project.status)) {
                return false;
            }
            if (selectedSystems.length > 0 && (!project.system || !selectedSystems.includes(project.system))) {
                return false;
            }
            if (selectedParticipantIds.length > 0) {
                const projectParticipants = new Set([
                    ...(project.productManagers || []).map(m => m.userId),
                    ...(project.backendDevelopers || []).map(m => m.userId),
                    ...(project.frontendDevelopers || []).map(m => m.userId),
                    ...(project.qaTesters || []).map(m => m.userId),
                ]);
                if (!selectedParticipantIds.some(id => projectParticipants.has(id))) {
                    return false;
                }
            }
            if (selectedKrIds.length > 0) {
                if (!selectedKrIds.some(krId => (project.keyResultIds || []).includes(krId))) {
                    return false;
                }
            }
            return true;
        });
        
        // 3. Sorting
        const priorityOrder: Record<Priority, number> = {
            [Priority.DeptOKR]: 0,
            [Priority.PersonalOKR]: 1,
            [Priority.UrgentRequirement]: 2,
            [Priority.LowPriority]: 3,
        };
        
        return filteredProjects.sort((a, b) => {
            // 1. Sort by Priority
            const priorityA = priorityOrder[a.priority];
            const priorityB = priorityOrder[b.priority];
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 2. Sort by System (系统属性)
            const systemA = a.system || 'zzz未分类';
            const systemB = b.system || 'zzz未分类';
            if (systemA.localeCompare(systemB, 'zh-CN') !== 0) {
                return systemA.localeCompare(systemB, 'zh-CN');
            }

            // 3. Sort by Product Manager name
            const getPmName = (project: Project) => {
                const productManagers = project.productManagers || [];
                if (productManagers.length > 0) {
                    const pm = allUsers.find(u => u.id === productManagers[0].userId);
                    return pm ? pm.name : 'zzzz';
                }
                return 'zzzz';
            };
            const pmA = getPmName(a);
            const pmB = getPmName(b);
            if (pmA.localeCompare(pmB, 'zh-CN') !== 0) {
                return pmA.localeCompare(pmB, 'zh-CN');
            }

            // 4. Sort by OKR ID
            const getOkrId = (project: Project) => {
                const keyResultIds = project.keyResultIds || [];
                if (keyResultIds.length > 0) {
                    const firstKrId = keyResultIds[0];
                    return keyResultToOkrMap.get(firstKrId) || 'zzzz';
                }
                return 'zzzz';
            };
            const okrA = getOkrId(a);
            const okrB = getOkrId(b);
            if (okrA.localeCompare(okrB) !== 0) {
                return okrA.localeCompare(okrB);
            }

            // 5. Sort by Status
            const statusOrder: Record<ProjectStatus, number> = {
                [ProjectStatus.NotStarted]: 0,
                [ProjectStatus.Discussion]: 1,
                [ProjectStatus.ProductDesign]: 2,
                [ProjectStatus.RequirementsDone]: 3,
                [ProjectStatus.ReviewDone]: 4,
                [ProjectStatus.InProgress]: 5,
                [ProjectStatus.ProjectInProgress]: 6,
                [ProjectStatus.DevDone]: 7,
                [ProjectStatus.Testing]: 8,
                [ProjectStatus.TestDone]: 9,
                [ProjectStatus.LaunchedThisWeek]: 10,
                [ProjectStatus.Completed]: 11,
                [ProjectStatus.Paused]: 12,
            };
            const statusA = statusOrder[a.status];
            const statusB = statusOrder[b.status];
            if (statusA !== statusB) {
                return statusA - statusB;
            }

            // 6. Fallback sort by proposed date
            return new Date(b.proposedDate).getTime() - new Date(a.proposedDate).getTime();
        });
    }, [projects, allUsers, keyResultToOkrMap, selectedPriorities, selectedSystems, selectedKrIds, selectedParticipantIds, selectedStatuses]);

    return (
        <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto bg-gray-100 dark:bg-[#1f1f1f]">
                <WeeklyMeetingFilterBar
                    allUsers={allUsers}
                    activeOkrs={activeOkrs}
                    selectedPriorities={selectedPriorities}
                    setSelectedPriorities={setSelectedPriorities}
                    selectedSystems={selectedSystems}
                    setSelectedSystems={setSelectedSystems}
                    selectedKrIds={selectedKrIds}
                    setSelectedKrIds={setSelectedKrIds}
                    selectedParticipantIds={selectedParticipantIds}
                    setSelectedParticipantIds={setSelectedParticipantIds}
                    selectedStatuses={selectedStatuses}
                    setSelectedStatuses={setSelectedStatuses}
                />
                {filteredAndSortedProjects.length > 0 ? (
                    <div className="weekly-meeting-grid">
                        {filteredAndSortedProjects.map(project => (
                            <WeeklyMeetingProjectCard
                                key={project.id}
                                project={project}
                                allUsers={allUsers}
                                activeOkrs={activeOkrs}
                                onOpenCommentModal={() => onOpenModal('comments', project.id)}
                                onUpdateProject={onUpdateProject}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-[#232323] border border-dashed border-gray-200 dark:border-[#363636] rounded-xl p-12 text-center text-gray-400 dark:text-gray-500">
                        <p>没有符合筛选条件的项目</p>
                    </div>
                )}
            </div>
        </main>
    );
};