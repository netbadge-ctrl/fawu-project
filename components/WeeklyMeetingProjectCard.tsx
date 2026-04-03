import React, { useState, useCallback } from 'react';
import { Project, User, Priority, ProjectStatus, OKR, Role, ProjectRoleKey } from '../types';
import { IconMessageCircle } from './Icons';
import { RichTextInput } from './RichTextInput';

// 全局弹窗管理
const tooltipRegistry = new Map<string, () => void>();

const globalTooltipController = {
    closeAll: () => {
        tooltipRegistry.forEach(closeFn => closeFn());
    },
    register: (id: string, closeFn: () => void) => {
        tooltipRegistry.set(id, closeFn);
    },
    unregister: (id: string) => {
        tooltipRegistry.delete(id);
    },
    closeOthers: (currentId: string) => {
        tooltipRegistry.forEach((closeFn, id) => {
            if (id !== currentId) {
                closeFn();
            }
        });
    }
};

const PriorityBadge: React.FC<{ priority: Priority; projectOkrs: OKR[]; project: Project }> = ({ priority, projectOkrs, project }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const tooltipId = React.useRef(`priority-${project.id}-${Date.now()}-${Math.random()}`);
    
    const closeTooltip = React.useCallback(() => {
        setShowTooltip(false);
    }, []);
    
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!showTooltip) {
            globalTooltipController.closeOthers(tooltipId.current);
        }
        setShowTooltip(!showTooltip);
        setMousePosition({ 
            x: e.clientX + window.scrollX, 
            y: e.clientY + window.scrollY 
        });
    };
    
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Element;
        if (!target.closest('.priority-tooltip-container')) {
            setShowTooltip(false);
        }
    };
    
    React.useEffect(() => {
        globalTooltipController.register(tooltipId.current, closeTooltip);
        return () => globalTooltipController.unregister(tooltipId.current);
    }, [closeTooltip]);
    
    React.useEffect(() => {
        if (showTooltip) {
            document.addEventListener('click', handleClickOutside);
            const handleScroll = () => setShowTooltip(false);
            window.addEventListener('scroll', handleScroll, true);
            return () => {
                document.removeEventListener('click', handleClickOutside);
                window.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [showTooltip]);
    
    const priorityStyles: Record<Priority, string> = {
        [Priority.DeptOKR]: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-600/70 dark:text-red-200 dark:border-red-500/80',
        [Priority.PersonalOKR]: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-600/70 dark:text-orange-200 dark:border-orange-500/80',
        [Priority.UrgentRequirement]: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-600/70 dark:text-yellow-200 dark:border-yellow-500/80',
        [Priority.LowPriority]: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-600/70 dark:text-blue-200 dark:border-blue-500/80',
    }
    
    return (
        <div className="relative priority-tooltip-container">
            <span 
                className={`px-2 py-0.5 text-xs font-semibold rounded-md border cursor-pointer ${priorityStyles[priority]}`}
                onClick={handleClick}
            >
                {priority}
            </span>
            
            {showTooltip && (
                <div className="fixed z-[10000] w-96 p-4 bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-[#4a4a4a] rounded-lg shadow-xl backdrop-blur-sm pointer-events-none max-h-80 overflow-y-auto" style={{
                    left: Math.min(mousePosition.x + 10, window.innerWidth - 400),
                    top: Math.max(10, Math.min(mousePosition.y - 50, window.innerHeight - 320)),
                }}>
                    <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">关联 OKR</h4>
                    <div className="text-xs space-y-2">
                        {projectOkrs.length > 0 ? (
                            projectOkrs.map(okr => (
                                <div key={okr.id}>
                                    <strong className="text-gray-600 dark:text-gray-300 block whitespace-pre-wrap">O: {okr.objective}</strong>
                                    <ul className="pl-3 list-disc list-inside">
                                        {okr.keyResults.filter(kr => (project.keyResultIds || []).includes(kr.id)).map(kr => (
                                            <li key={kr.id} className="text-gray-700 dark:text-gray-400 whitespace-pre-wrap">KR: {kr.description}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-400 dark:text-gray-500 italic">未关联</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const StatusBadge: React.FC<{ status: ProjectStatus; project: Project; allUsers: User[] }> = ({ status, project, allUsers }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const tooltipId = React.useRef(`status-${project.id}-${Date.now()}-${Math.random()}`);
  
  const closeTooltip = React.useCallback(() => {
    setShowTooltip(false);
  }, []);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showTooltip) {
      globalTooltipController.closeOthers(tooltipId.current);
    }
    setShowTooltip(!showTooltip);
    setMousePosition({ 
      x: e.clientX + window.scrollX, 
      y: e.clientY + window.scrollY 
    });
  };
  
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target.closest('.status-tooltip-container')) {
      setShowTooltip(false);
    }
  };
  
  React.useEffect(() => {
    globalTooltipController.register(tooltipId.current, closeTooltip);
    return () => globalTooltipController.unregister(tooltipId.current);
  }, [closeTooltip]);
  
  React.useEffect(() => {
    if (showTooltip) {
      document.addEventListener('click', handleClickOutside);
      const handleScroll = () => setShowTooltip(false);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [showTooltip]);
  
  const statusStyles: Record<ProjectStatus, string> = {
    [ProjectStatus.NotStarted]: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-600/50 dark:text-gray-300 dark:border-gray-500/60',
    [ProjectStatus.Discussion]: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-600/50 dark:text-purple-300 dark:border-purple-500/60',
    [ProjectStatus.RequirementsDone]: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-600/50 dark:text-blue-300 dark:border-blue-500/60',
    [ProjectStatus.ReviewDone]: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-600/50 dark:text-cyan-300 dark:border-cyan-500/60',
    [ProjectStatus.ProductDesign]: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-600/50 dark:text-indigo-300 dark:border-indigo-500/60',
    [ProjectStatus.InProgress]: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-600/50 dark:text-orange-300 dark:border-orange-500/60',
    [ProjectStatus.DevDone]: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-600/50 dark:text-yellow-300 dark:border-yellow-500/60',
    [ProjectStatus.Testing]: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-600/50 dark:text-pink-300 dark:border-pink-500/60',
    [ProjectStatus.TestDone]: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-600/50 dark:text-teal-300 dark:border-teal-500/60',
    [ProjectStatus.LaunchedThisWeek]: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-600/50 dark:text-green-300 dark:border-green-500/60',
    [ProjectStatus.Completed]: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-600/50 dark:text-emerald-300 dark:border-emerald-500/60',
    [ProjectStatus.Paused]: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-600/50 dark:text-red-300 dark:border-red-500/60',
    [ProjectStatus.ProjectInProgress]: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-600/50 dark:text-violet-300 dark:border-violet-500/60',
  };
  
  const roleInfo: { key: ProjectRoleKey, name: string }[] = [
    { key: 'productManagers', name: '产品' },
    { key: 'backendDevelopers', name: '后端' },
    { key: 'frontendDevelopers', name: '前端' },
    { key: 'qaTesters', name: '测试' },
  ];
  
  return (
    <div className="relative status-tooltip-container">
      <span 
        className={`px-2 py-0.5 text-xs font-medium rounded-full border cursor-pointer ${statusStyles[status]}`}
        onClick={handleClick}
      >
        {status}
      </span>
      
      {showTooltip && (
        <div className="fixed z-[10000] w-96 p-4 bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-[#4a4a4a] rounded-lg shadow-xl backdrop-blur-sm pointer-events-none max-h-80 overflow-y-auto" style={{
            left: Math.min(mousePosition.x + 10, window.innerWidth - 400),
            top: Math.max(10, Math.min(mousePosition.y - 50, window.innerHeight - 320)),
        }}>
          <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">团队角色与排期</h4>
          <div className="divide-y divide-gray-200 dark:divide-gray-600/50 text-sm">
            {roleInfo.map(({ key, name }) => {
              const team = project[key] as Role;
              return (
                <div key={key} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-12 flex-shrink-0">{name}:</span>
                    <div className="flex-1 text-right">
                      {team && team.length > 0 ? (
                        <div className="space-y-1">
                          {team.map((member, idx) => {
                            const user = allUsers.find(u => u.id === member.userId);
                            const userName = user ? user.name : '未知用户';
                            
                            // 获取成员的排期信息（支持多段排期）
                            let scheduleText = '';
                            if (member.timeSlots && member.timeSlots.length > 0) {
                              // 过滤出有效的时段（有开始和结束日期）
                              const validSlots = member.timeSlots.filter((slot: any) => slot.startDate && slot.endDate);
                              
                              if (validSlots.length === 0) {
                                // 如果没有有效时段，检查是否有只有开始日期的时段
                                const startOnlySlots = member.timeSlots.filter((slot: any) => slot.startDate && !slot.endDate);
                                if (startOnlySlots.length > 0) {
                                  scheduleText = startOnlySlots[0].startDate.split('T')[0] + ' 开始';
                                }
                              } else if (validSlots.length === 1) {
                                // 如果只有一个时段，直接返回该时段的日期范围
                                const slot = validSlots[0];
                                scheduleText = `${slot.startDate.split('T')[0]} ~ ${slot.endDate.split('T')[0]}`;
                              } else {
                                // 多段排期：找到最早的开始日期和最晚的结束日期
                                const sortedSlots = validSlots.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
                                const firstStartDate = sortedSlots[0].startDate.split('T')[0];
                                
                                // 找到最晚的结束日期
                                const latestEndDate = validSlots.reduce((latest: string, slot: any) => {
                                  const slotEndDate = new Date(slot.endDate);
                                  const latestDate = new Date(latest);
                                  return slotEndDate > latestDate ? slot.endDate : latest;
                                }, validSlots[0].endDate);
                                
                                const lastEndDate = latestEndDate.split('T')[0];
                                scheduleText = `${firstStartDate} ~ ${lastEndDate}`;
                              }
                            } else if (member.startDate && member.endDate) {
                              // 兼容旧的startDate/endDate字段
                              scheduleText = `${member.startDate.split('T')[0]} ~ ${member.endDate.split('T')[0]}`;
                            } else if (member.startDate) {
                              scheduleText = member.startDate.split('T')[0] + ' 开始';
                            }
                            
                            return (
                              <div key={`${member.userId}-${idx}`} className="text-gray-600 dark:text-gray-400">
                                <span className="font-medium">{userName}</span>
                                {scheduleText && (
                                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                                    {scheduleText}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic text-xs">无</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface WeeklyMeetingProjectCardProps {
    project: Project;
    allUsers: User[];
    activeOkrs: OKR[];
    onOpenCommentModal: () => void;
    onUpdateProject?: (projectId: string, field: keyof Project, value: any) => void;
}

const EditableUpdateDisplay: React.FC<{
    html: string;
    title: string;
    projectId: string;
    onUpdateProject?: (projectId: string, field: keyof Project, value: any) => void;
    isEditable?: boolean;
}> = ({ html, title, projectId, onUpdateProject, isEditable = false }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editHtml, setEditHtml] = useState(html);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const tooltipId = React.useRef(`update-${projectId}-${title}-${Date.now()}-${Math.random()}`);
    const content = html || '<p class="text-gray-400 dark:text-gray-500 italic">无</p>';
    
    const closeTooltip = React.useCallback(() => {
        setShowTooltip(false);
    }, []);
    
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // 只有点击内容区域才显示tooltip，不进入编辑模式
        if (!showTooltip) {
            globalTooltipController.closeOthers(tooltipId.current);
        }
        setShowTooltip(!showTooltip);
        setMousePosition({ 
            x: e.clientX + window.scrollX, 
            y: e.clientY + window.scrollY 
        });
    };
    
    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isEditable && !isEditing) {
            setIsEditing(true);
            setEditHtml(html);
        }
    };
    
    const handleSave = useCallback(() => {
        if (onUpdateProject && editHtml !== html) {
            onUpdateProject(projectId, 'weeklyUpdate', editHtml);
        }
        setIsEditing(false);
    }, [onUpdateProject, projectId, editHtml, html]);
    
    const handleCancel = useCallback(() => {
        setEditHtml(html);
        setIsEditing(false);
    }, [html]);
    
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Element;
        if (!target.closest('.update-tooltip-container')) {
            setShowTooltip(false);
        }
    };
    
    React.useEffect(() => {
        globalTooltipController.register(tooltipId.current, closeTooltip);
        return () => globalTooltipController.unregister(tooltipId.current);
    }, [closeTooltip]);
    
    React.useEffect(() => {
        if (showTooltip) {
            document.addEventListener('click', handleClickOutside);
            // 只在窗口滚动时关闭弹窗，弹窗内部滚动不关闭
            const handleScroll = (e: Event) => {
                const target = e.target as Element;
                // 如果滚动发生在弹窗内部，不关闭
                if (target && target.closest('.update-tooltip-popup')) {
                    return;
                }
                setShowTooltip(false);
            };
            window.addEventListener('scroll', handleScroll, true);
            return () => {
                document.removeEventListener('click', handleClickOutside);
                window.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [showTooltip]);
    
    if (isEditing) {
        return (
            <div className="relative update-tooltip-container">
                <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">{title}</h4>
                <div className="border border-blue-400 rounded-lg p-2 bg-blue-50 dark:bg-blue-900/20">
                    <RichTextInput
                        html={editHtml}
                        onChange={setEditHtml}
                        placeholder="输入本周进展/问题..."
                        minRows={4}
                        maxRows={10}
                    />
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                        <button
                            onClick={handleCancel}
                            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    // 判断是否为上周进展，应用灰色样式
    const isLastWeek = title === '上周进展/问题';
    
    return (
        <div className="relative update-tooltip-container">
            <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">
                {title}
                {isEditable && (
                    <span 
                        className="ml-2 text-xs text-blue-500 dark:text-blue-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                        onClick={handleEditClick}
                    >
                        (点击编辑)
                    </span>
                )}
            </h4>
            <div
                className={`p-3 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg min-h-[6rem] max-h-[9rem] overflow-hidden text-sm weekly-update-content cursor-pointer leading-relaxed ${
                    isLastWeek ? 'text-gray-500 dark:text-gray-500' : 'text-gray-800 dark:text-gray-300'
                }`}
                dangerouslySetInnerHTML={{ __html: content }}
                onClick={handleClick}
                style={{
                    wordWrap: 'break-word',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    display: '-webkit-box',
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: 'vertical'
                }}
            />
            
            {showTooltip && (
                <div className="fixed z-[10000] w-[560px] p-5 bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-[#4a4a4a] rounded-lg shadow-xl backdrop-blur-sm max-h-[500px] overflow-y-auto update-tooltip-popup" style={{
                    left: Math.min(mousePosition.x + 10, window.innerWidth - 580),
                    top: Math.max(10, Math.min(mousePosition.y - 50, window.innerHeight - 520)),
                }}>
                    <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">{title}</h4>
                    <div
                        className="text-sm text-gray-800 dark:text-gray-300 weekly-update-content whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: content }}
                        style={{
                            wordWrap: 'break-word',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere'
                        }}
                    />
                </div>
            )}
            
            {/* Basic styling for contenteditable output */}
            <style>{`
              .weekly-update-content b { font-weight: 600; }
              .weekly-update-content font[color="#ef4444"] { color: #ef4444; }
              .weekly-update-content p { margin-bottom: 0.25rem; display: block; line-height: 1.4; }
              .weekly-update-content br { display: block; margin: 0.1rem 0; }
              .weekly-update-content div { margin-bottom: 0.25rem; }
              .weekly-update-content {
                word-wrap: break-word;
                word-break: break-word;
                overflow-wrap: anywhere;
                white-space: pre-wrap;
                line-height: 1.4;
              }
              .weekly-update-content * {
                word-wrap: break-word;
                word-break: break-word;
                overflow-wrap: anywhere;
                max-width: 100%;
              }
              /* 确保 strong 标签在块级上下文中显示 */
              .weekly-update-content strong {
                display: inline;
              }
            `}</style>
        </div>
    );
};

const BusinessProblemDisplay: React.FC<{businessProblem: string, projectId: string}> = ({businessProblem, projectId}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const tooltipId = React.useRef(`business-${projectId}-${Date.now()}-${Math.random()}`);
    const content = businessProblem || '无';
    
    const closeTooltip = React.useCallback(() => {
        setShowTooltip(false);
    }, []);
    
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!showTooltip) {
            globalTooltipController.closeOthers(tooltipId.current);
        }
        setShowTooltip(!showTooltip);
        setMousePosition({ 
            x: e.clientX + window.scrollX, 
            y: e.clientY + window.scrollY 
        });
    };
    
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Element;
        if (!target.closest('.business-problem-tooltip-container')) {
            setShowTooltip(false);
        }
    };
    
    React.useEffect(() => {
        globalTooltipController.register(tooltipId.current, closeTooltip);
        return () => globalTooltipController.unregister(tooltipId.current);
    }, [closeTooltip]);
    
    React.useEffect(() => {
        if (showTooltip) {
            document.addEventListener('click', handleClickOutside);
            const handleScroll = () => setShowTooltip(false);
            window.addEventListener('scroll', handleScroll, true);
            return () => {
                document.removeEventListener('click', handleClickOutside);
                window.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [showTooltip]);
    
    return (
        <div className="relative business-problem-tooltip-container">
            <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">解决的业务问题</h4>
            <div 
                className="p-3 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg text-sm text-gray-800 dark:text-gray-300 min-h-[5rem] max-h-[7.5rem] overflow-hidden cursor-pointer leading-relaxed flex items-start"
                onClick={handleClick}
            >
                <p className="whitespace-pre-wrap line-clamp-5 w-full">
                    {content === '无' ? <span className="text-gray-400 dark:text-gray-500 italic">无</span> : content}
                </p>
            </div>
            
            {showTooltip && content !== '无' && (
                <div className="fixed z-[10000] w-[560px] p-5 bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-[#4a4a4a] rounded-lg shadow-xl backdrop-blur-sm max-h-[500px] overflow-y-auto pointer-events-none" style={{
                    left: Math.min(mousePosition.x + 10, window.innerWidth - 580),
                    top: Math.max(10, Math.min(mousePosition.y - 50, window.innerHeight - 520)),
                }}>
                    <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">解决的业务问题</h4>
                    <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{content}</p>
                </div>
            )}
        </div>
    );
};

export const WeeklyMeetingProjectCard: React.FC<WeeklyMeetingProjectCardProps> = ({ project, allUsers, activeOkrs, onOpenCommentModal, onUpdateProject }) => {
    const projectOkrs = activeOkrs.filter(okr => 
        okr.keyResults.some(kr => (project.keyResultIds || []).includes(kr.id))
    );

    // 获取产品经理姓名
    const getProductManagerNames = () => {
        if (!project.productManagers || project.productManagers.length === 0) {
            return '无';
        }
        
        const names = project.productManagers
            .map(member => {
                const user = allUsers.find(u => u.id === member.userId);
                return user ? user.name : '未知';
            })
            .filter(name => name !== '未知');
            
        return names.length > 0 ? names.join('、') : '无';
    };

    return (
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl flex flex-col shadow-sm hover:shadow-lg transition-shadow duration-300 w-full overflow-visible">
            {/* Card Header */}
            <div className="p-4 border-b border-gray-200 dark:border-[#363636]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight max-h-[3.5rem] overflow-hidden">{project.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                    <PriorityBadge priority={project.priority} projectOkrs={projectOkrs} project={project} />
                    <StatusBadge status={project.status} project={project} allUsers={allUsers} />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 ml-1 py-0.5 inline-block">
                        产品：{getProductManagerNames()}
                    </span>
                </div>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3 flex-grow flex flex-col overflow-visible">
                {/* Business Problem Section */}
                <div className="flex-shrink-0">
                    <BusinessProblemDisplay businessProblem={project.businessProblem} projectId={project.id} />
                </div>

                {/* Updates Section - 改为上下布局，本周在上 */}
                <div className="space-y-4 flex-grow">
                    <div>
                        <EditableUpdateDisplay 
                            title="本周进展/问题" 
                            html={project.weeklyUpdate} 
                            projectId={project.id} 
                            onUpdateProject={onUpdateProject}
                            isEditable={!!onUpdateProject}
                        />
                    </div>
                    <div>
                        <EditableUpdateDisplay 
                            title="上周进展/问题" 
                            html={project.lastWeekUpdate} 
                            projectId={project.id}
                            isEditable={false}
                        />
                    </div>
                </div>
            </div>

            {/* Card Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-[#363636] bg-gray-50 dark:bg-[#2a2a2a]/50 rounded-b-xl flex justify-between items-center">
                {/* 系统标签 */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    {project.system ? (
                        <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-700/50">
                            {project.system}
                        </span>
                    ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic text-xs">未设置系统</span>
                    )}
                </div>
                
                {/* 评论按钮 */}
                <button
                    onClick={onOpenCommentModal}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] rounded-lg hover:bg-gray-100 dark:hover:bg-[#454545] transition-colors"
                >
                    <IconMessageCircle className="w-4 h-4" />
                    评论 ({(project.comments || []).length})
                </button>
            </div>
        </div>
    );
};