import React from 'react';
import { User, ProjectStatus, OKR, Priority } from '../types';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { KRFilterButton } from './KRFilterButton';

interface WeeklyMeetingFilterBarProps {
    allUsers: User[];
    activeOkrs: OKR[];

    selectedPriorities: string[];
    setSelectedPriorities: (values: string[]) => void;

    selectedKrIds: string[];
    setSelectedKrIds: (values: string[]) => void;

    selectedParticipantIds: string[];
    setSelectedParticipantIds: (values: string[]) => void;

    selectedStatuses: string[];
    setSelectedStatuses: (values: string[]) => void;
}

export const WeeklyMeetingFilterBar: React.FC<WeeklyMeetingFilterBarProps> = ({
    allUsers,
    activeOkrs,
    selectedPriorities,
    setSelectedPriorities,
    selectedKrIds,
    setSelectedKrIds,
    selectedParticipantIds,
    setSelectedParticipantIds,
    selectedStatuses,
    setSelectedStatuses
}) => {

    const priorityOptions = [
        { value: '', label: '未设置' },
        ...Object.values(Priority).map(p => ({ value: p, label: p }))
    ];

    // 按部门分组参与人选项
    const participantGroupedOptions = React.useMemo(() => {
        const departmentMap = new Map<string, User[]>();

        // 按部门分组
        allUsers.forEach(user => {
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
                    .map(u => ({ value: u.id, label: u.name }))
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    }, [allUsers]);

    const statusOptions = [
        { value: '', label: '未设置' },
        ProjectStatus.NotStarted,
        ProjectStatus.Discussion,
        ProjectStatus.ProductDesign,
        ProjectStatus.RequirementsDone,
        ProjectStatus.ReviewDone,
        ProjectStatus.InProgress,
        ProjectStatus.ProjectInProgress,
        ProjectStatus.DevDone,
        ProjectStatus.Testing,
        ProjectStatus.TestDone,
        ProjectStatus.LaunchedThisWeek,
        ProjectStatus.Completed,
        ProjectStatus.Paused,
    ].map(s => typeof s === 'string' ? { value: s, label: s } : s);

    return (
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl p-4 flex flex-wrap items-center gap-4 mb-6">
            <MultiSelectDropdown
                options={priorityOptions}
                selectedValues={selectedPriorities}
                onSelectionChange={setSelectedPriorities}
                placeholder="优先级"
            />
            <KRFilterButton
                activeOkrs={activeOkrs}
                selectedKrs={selectedKrIds}
                setSelectedKrs={setSelectedKrIds}
                placeholder="按KR筛选"
            />
            <MultiSelectDropdown
                groupedOptions={participantGroupedOptions}
                selectedValues={selectedParticipantIds}
                onSelectionChange={setSelectedParticipantIds}
                placeholder="参与人"
                userData={allUsers}
            />
            <MultiSelectDropdown
                options={statusOptions}
                selectedValues={selectedStatuses}
                onSelectionChange={setSelectedStatuses}
                placeholder="状态"
            />
        </div>
    );
};
