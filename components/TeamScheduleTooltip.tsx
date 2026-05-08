import React from 'react';
import { Project, User, Role } from '../types';
import { countTimeSlotsWorkingDays, countWorkingDaysInRange } from '../utils/holidays';

interface TeamScheduleTooltipProps {
  project: Project;
  allUsers: User[];
}

// 计算成员工作日天数（去周末 + 去法定节假日，多段去重合并），与 ProjectDetailModal 口径一致
const getMemberWorkingDays = (member: any): number => {
  if (member.timeSlots && member.timeSlots.length > 0) {
    return countTimeSlotsWorkingDays(member.timeSlots);
  }
  if (member.startDate && member.endDate) {
    return countWorkingDaysInRange(member.startDate, member.endDate);
  }
  return 0;
};

// 获取成员的排期信息（支持多段排期）,返回{ schedule: string, isExpired: boolean }
const getMemberSchedule = (member: any): { schedule: string; isExpired: boolean } => {
  // 获取当前日期(只比较日期,不比较时间)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let isExpired = false;
  
  // 检查是否有timeSlots
  if (member.timeSlots && member.timeSlots.length > 0) {
    // 过滤出有效的时段（有开始和结束日期）
    const validSlots = member.timeSlots.filter((slot: any) => slot.startDate && slot.endDate);
    
    if (validSlots.length === 0) {
      // 如果没有有效时段，检查是否有只有开始日期的时段
      const startOnlySlots = member.timeSlots.filter((slot: any) => slot.startDate && !slot.endDate);
      if (startOnlySlots.length > 0) {
        const startDateObj = new Date(startOnlySlots[0].startDate);
        if (!isNaN(startDateObj.getTime())) {
          return { schedule: startOnlySlots[0].startDate.replace(/-/g, '.') + ' 开始', isExpired: false };
        }
      }
      return { schedule: '无排期', isExpired: false };
    }
    
    // 如果只有一个时段，直接返回该时段的日期范围
    if (validSlots.length === 1) {
      const slot = validSlots[0];
      const startDateObj = new Date(slot.startDate);
      const endDateObj = new Date(slot.endDate);
      endDateObj.setHours(0, 0, 0, 0);
      isExpired = endDateObj < today;
      
      if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
        const startDate = startDateObj.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit'
        }).replace(/\//g, '.');
        const endDate = endDateObj.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit'
        }).replace(/\//g, '.');
        return { schedule: `${startDate} - ${endDate}`, isExpired };
      }
      return { schedule: '无排期', isExpired: false };
    }
    
    // 多段排期：找到最早的开始日期和最晚的结束日期
    const sortedSlots = validSlots.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const firstStartDateObj = new Date(sortedSlots[0].startDate);
    
    // 找到最晚的结束日期
    const latestEndDate = validSlots.reduce((latest: string, slot: any) => {
      const slotEndDate = new Date(slot.endDate);
      const latestDate = new Date(latest);
      return slotEndDate > latestDate ? slot.endDate : latest;
    }, validSlots[0].endDate);
    
    const lastEndDateObj = new Date(latestEndDate);
    lastEndDateObj.setHours(0, 0, 0, 0);
    isExpired = lastEndDateObj < today;
    
    if (!isNaN(firstStartDateObj.getTime()) && !isNaN(lastEndDateObj.getTime())) {
      const startDate = firstStartDateObj.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '.');
      const endDate = lastEndDateObj.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '.');
      return { schedule: `${startDate} - ${endDate}`, isExpired };
    }
    return { schedule: '无排期', isExpired: false };
  }
  
  // 兼容旧的startDate/endDate字段
  if (member.startDate && member.endDate) {
    const startDateObj = new Date(member.startDate);
    const endDateObj = new Date(member.endDate);
    endDateObj.setHours(0, 0, 0, 0);
    isExpired = endDateObj < today;
    
    if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
      return { schedule: `${member.startDate.replace(/-/g, '.')} - ${member.endDate.replace(/-/g, '.')}`, isExpired };
    }
  } else if (member.startDate) {
    const startDateObj = new Date(member.startDate);
    if (!isNaN(startDateObj.getTime())) {
      return { schedule: `${member.startDate.replace(/-/g, '.')} 开始`, isExpired: false };
    }
  }
  
  return { schedule: '无排期', isExpired: false };
};

const RoleSection: React.FC<{ role: Role; roleName: string; allUsers: User[] }> = ({ role, roleName, allUsers }) => {
  if (!role || role.length === 0) return null;

  return (
    <div>
      <h4 className="font-semibold text-xs text-gray-400 mb-1">{roleName}</h4>
      <ul className="space-y-1 text-xs">
        {(role || []).map(member => {
          const user = allUsers.find(u => u.id === member.userId);
          if (!user) return null;
          
          const { schedule, isExpired } = getMemberSchedule(member);
          const workingDays = getMemberWorkingDays(member);
          
          return (
            <li key={user.id} className="flex justify-between items-center gap-3">
              <span className="text-gray-200">{user.name}</span>
              <span className={`font-mono ${
                isExpired
                  ? 'text-gray-500 dark:text-gray-600'
                  : 'text-gray-400'
              }`}>
                {schedule}
                {workingDays > 0 && (
                  <span className={`ml-2 ${isExpired ? 'text-gray-600' : 'text-gray-500'}`}>· 共 {workingDays} 天</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const TeamScheduleTooltip: React.FC<TeamScheduleTooltipProps> = ({ project, allUsers }) => {
  const roles = [
    { data: project.productManagers || [], name: '产品经理' },
    { data: project.backendDevelopers || [], name: '后端研发' },
    { data: project.frontendDevelopers || [], name: '前端研发' },
    { data: project.qaTesters || [], name: '测试' },
  ];

  const hasAnyMembers = roles.some(r => (r.data || []).length > 0);

  return (
    <div className="bg-gray-800/95 dark:bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg shadow-2xl w-64 text-sm space-y-2 border border-white/10">
      <h3 className="font-bold mb-2 border-b border-gray-600 pb-1.5">{project.name} - 团队排期</h3>
      {hasAnyMembers ? (
        roles.map(role => (
          <RoleSection key={role.name} role={role.data} roleName={role.name} allUsers={allUsers} />
        ))
      ) : (
        <p className="text-gray-400 text-xs italic">该项目暂无成员分配。</p>
      )}
    </div>
  );
};
