import React, { useMemo } from 'react';
import { Project, User, OKR, ProjectStatus } from '../types';
import { IconBriefcase, IconRocket, IconClipboard, IconTarget } from './Icons';

interface AnnualStatsProps {
  projects: Project[];
  activeOkrs: OKR[];
  currentUser: User;
}

const StatCard: React.FC<{ icon: React.ReactNode; title: string; value: number | string; colorClasses: string; }> = ({ icon, title, value, colorClasses }) => (
    <div className={`p-4 rounded-xl flex items-center gap-4 ${colorClasses}`}>
        <div className="p-3 rounded-lg bg-white/20">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium opacity-80">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
        </div>
    </div>
);

export const AnnualStats: React.FC<AnnualStatsProps> = ({ projects, activeOkrs, currentUser }) => {
    
    const stats = useMemo(() => {
        const currentYear = new Date().getFullYear();
        
        const myProjects = (projects || []).filter(p =>
            (p.owners || []).some(m => m?.userId === currentUser.id)
        );

        const annualProjects = myProjects.filter(p =>
            p.proposedDate && new Date(p.proposedDate).getFullYear() === currentYear
        );

        // 年度完成项目：状态为"已完成"、"本周已上线"且完成日期在当前年度的项目
        const launchedProjects = myProjects.filter(p =>
            (p.status === ProjectStatus.Completed || p.status === ProjectStatus.LaunchedThisWeek) &&
            p.completionDate && new Date(p.completionDate).getFullYear() === currentYear
        );

        // 我参与的正在进行的项目：只排除"暂停"和"已完成"状态的项目
        const ongoingOkrProjects = myProjects.filter(p =>
            p.status !== ProjectStatus.Paused &&
            p.status !== ProjectStatus.Completed
        );

        // 年度已完成的OKR项目：项目优先级为"部门OKR"且项目状态为"已完成"、"本周已上线"且完成日期在本年的日期范围
        const launchedOkrProjects = myProjects.filter(p =>
            p.priority === '部门OKR' &&
            (p.status === ProjectStatus.Completed || p.status === ProjectStatus.LaunchedThisWeek) &&
            p.completionDate &&
            new Date(p.completionDate).getFullYear() === currentYear
        );

        const krToOkrMap = new Map<string, string>();
        (activeOkrs || []).forEach(okr => {
            (okr.keyResults || []).forEach(kr => {
                krToOkrMap.set(kr.id, okr.id);
            });
        });
        
        const contributedOkrIds = new Set<string>();
        myProjects.forEach(p => {
            (p.keyResultIds || []).forEach(krId => {
                const okrId = krToOkrMap.get(krId);
                if (okrId) {
                    contributedOkrIds.add(okrId);
                }
            });
        });

        return {
            launchedCount: launchedProjects.length,
            ongoingOkrCount: ongoingOkrProjects.length,
            launchedOkrCount: launchedOkrProjects.length,
        };
    }, [projects, activeOkrs, currentUser]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <StatCard 
                icon={<IconRocket className="w-6 h-6"/>}
                title="年度上线项目"
                value={stats.launchedCount}
                colorClasses="bg-green-500 text-white"
            />
            <StatCard 
                icon={<IconClipboard className="w-6 h-6"/>}
                title="我参与的正在进行的项目"
                value={stats.ongoingOkrCount}
                colorClasses="bg-orange-500 text-white"
            />
            <StatCard 
                icon={<IconTarget className="w-6 h-6"/>}
                title="年度已上线OKR项目"
                value={stats.launchedOkrCount}
                colorClasses="bg-purple-500 text-white"
            />
        </div>
    );
};