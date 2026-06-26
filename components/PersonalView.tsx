import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Project, User, OKR, ProjectStatus, Comment } from '../types';
import { ProjectCard } from './ProjectCard';
import { ProjectDetailModal } from './ProjectDetailModal';
import { ActivityItem } from './ActivityItem';
import { AnnualStats } from './AnnualStats';


interface PersonalViewProps {
  projects: Project[];
  allUsers: User[];
  activeOkrs: OKR[];
  currentUser: User;
  onUpdateProject: (projectId: string, field: keyof Project, value: any) => void;
  onOpenModal: (type: 'role' | 'comments' | 'changelog', projectId: string, details?: any) => void;
  onToggleFollow: (projectId: string) => void;
  onReply: (project: Project, user: User) => void;
  isLoadingUsers?: boolean; // 用户数据加载中状态
  isLoadingOkrs?: boolean;  // OKR数据加载中状态
}

export const PersonalView: React.FC<PersonalViewProps> = ({ 
  projects, 
  allUsers, 
  activeOkrs, 
  currentUser, 
  onUpdateProject, 
  onOpenModal, 
  onToggleFollow, 
  onReply,
  isLoadingUsers = false,
  isLoadingOkrs = false
}) => {
  
  const handleMarkAsRead = useCallback(async (projectId: string, commentId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const comment = project.comments.find(c => c.id === commentId);
    if (!comment) return;

    const readBy = comment.readBy || [];
    if (!readBy.includes(currentUser.id)) {
      const updatedReadBy = [...readBy, currentUser.id];
      const updatedComments = project.comments.map(c => 
        c.id === commentId ? { ...c, readBy: updatedReadBy } : c
      );
      await onUpdateProject(projectId, 'comments', updatedComments);
    }
  }, [projects, currentUser.id, onUpdateProject]);
  
  const [detailModalProject, setDetailModalProject] = useState<Project | null>(null);

  useEffect(() => {
    if (detailModalProject) {
        const updatedProject = projects.find(p => p.id === detailModalProject.id);
        if (updatedProject && JSON.stringify(updatedProject) !== JSON.stringify(detailModalProject)) {
            setDetailModalProject(updatedProject);
        }
    }
  }, [projects, detailModalProject]);

  const { myActiveProjects, followedProjects, activityFeed } = useMemo(() => {
    // 早期返回，避免不必要的计算
    if (!projects || projects.length === 0) {
      return { myActiveProjects: [], followedProjects: [], activityFeed: [] };
    }
    
    const myActive: Project[] = [];
    const followed: Project[] = [];
    const userId = currentUser.id;

    // 优化：一次遍历完成所有分类
    projects.forEach(p => {
      const isParticipant = (
        (p.owners || []).some(m => m?.userId === userId)
      );

      // 显示我参与的除了"暂停"和"已完成"状态之外的所有项目
      const isOngoing = p.status !== ProjectStatus.Paused && 
                       p.status !== ProjectStatus.Completed;

      if (isParticipant && isOngoing) {
        myActive.push(p);
      }

      if (p.followers?.includes(userId)) {
        followed.push(p);
      }
    });

    // 排序配置提取到外部，避免每次创建
    const priorityOrder: Record<string, number> = {
      '部门OKR': 1,
      '个人OKR': 2,
      '临时重要需求': 3,
      '不重要的需求': 4
    };

    const statusOrder: Partial<Record<ProjectStatus, number>> = {
      [ProjectStatus.InProgress]: 1,
      [ProjectStatus.Testing]: 2,
      [ProjectStatus.ReviewDone]: 3,
      [ProjectStatus.RequirementsDone]: 4,
      [ProjectStatus.ProductDesign]: 5,
      [ProjectStatus.Discussion]: 6,
      [ProjectStatus.LaunchedThisWeek]: 7,
      [ProjectStatus.NotStarted]: 8
    };

    // 优化排序：使用单次排序
    myActive.sort((a, b) => {
      const priorityA = priorityOrder[a.priority] ?? 999;
      const priorityB = priorityOrder[b.priority] ?? 999;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      const statusA = statusOrder[a.status] ?? 999;
      const statusB = statusOrder[b.status] ?? 999;
      
      return statusA - statusB;
    });

    // 优化：使用 Set 提高查找性能
    const relevantProjectIds = new Set([
        ...myActive.map(p => p.id),
        ...followed.map(p => p.id),
    ]);

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoTime = twoWeeksAgo.getTime();

    const allComments: { comment: Comment; project: Project }[] = [];
    const seenCommentIds = new Set<string>();

    // 优化：减少重复的日期创建
    projects.forEach(p => {
        const pId = p.id;
        const isRelevant = relevantProjectIds.has(pId);
        
        (p.comments || []).forEach(c => {
            if (seenCommentIds.has(c.id)) return;
            
            const commentTime = new Date(c.createdAt).getTime();
            const isMentioned = c.mentions?.includes(userId) ?? false;
            
            if (commentTime >= twoWeeksAgoTime && (isRelevant || isMentioned)) {
                allComments.push({ comment: c, project: p });
                seenCommentIds.add(c.id);
            }
        });
    });
    
    // 优化排序：直接比较时间戳
    allComments.sort((a, b) => {
      const timeA = new Date(a.comment.createdAt).getTime();
      const timeB = new Date(b.comment.createdAt).getTime();
      return timeB - timeA;
    });

    return { myActiveProjects: myActive, followedProjects: followed, activityFeed: allComments };
  }, [projects, currentUser.id]);

  // 使用 React.memo 优化 Section 组件
  const Section = React.memo<{ title: string; count: number; children: React.ReactNode }>(({ title, count, children }) => (
    <section>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        {title} <span className="text-base font-normal text-gray-500 dark:text-gray-400">({count})</span>
      </h2>
      {count > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {children}
          </div>
      ) : (
          <div className="bg-white dark:bg-[#232323] border border-dashed border-gray-200 dark:border-[#363636] rounded-xl p-8 text-center text-gray-400 dark:text-gray-500">
              <p>暂无相关项目</p>
          </div>
      )}
    </section>
  ));
  Section.displayName = 'Section';

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-gray-100 dark:bg-[#1f1f1f]">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
        {/* 次要数据加载指示器 */}
        {(isLoadingUsers || isLoadingOkrs) && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-lg px-3 py-2 w-fit">
            <div className="w-3 h-3 border-2 border-gray-300 dark:border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
            <span>{isLoadingOkrs ? '正在加载 OKR 数据...' : '正在加载用户数据...'}</span>
          </div>
        )}
        <AnnualStats projects={projects} currentUser={currentUser} activeOkrs={activeOkrs} />
        
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            {/* Left column for projects */}
            <div className="lg:col-span-3 space-y-8">
                <Section title="我参与的正在进行的项目" count={myActiveProjects.length}>
                  {myActiveProjects.map(project => (
                    <ProjectCard key={`my-${project.id}`} project={project} allUsers={allUsers} onClick={() => setDetailModalProject(project)} />
                  ))}
                </Section>
                <Section title="我关注的项目" count={followedProjects.length}>
                  {followedProjects.map(project => (
                    <ProjectCard key={`followed-${project.id}`} project={project} allUsers={allUsers} onClick={() => setDetailModalProject(project)} />
                  ))}
                </Section>
            </div>

            {/* Right column for activity feed */}
            <div className="lg:col-span-1 lg:sticky lg:top-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    过去两周的评论
                </h2>
                {activityFeed.length > 0 ? (
                    <div className="space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2 -mr-2">
                        {activityFeed.map(({ comment, project }) => (
                            <ActivityItem 
                                key={comment.id}
                                comment={comment}
                                project={project}
                                allUsers={allUsers}
                                currentUser={currentUser}
                                onReply={onReply}
                                onMarkAsRead={handleMarkAsRead}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-[#232323] border border-dashed border-gray-200 dark:border-[#363636] rounded-xl p-8 text-center text-gray-400 dark:text-gray-500">
                        <p>暂无动态</p>
                    </div>
                )}
            </div>
        </div>
      </div>

      {detailModalProject && (
        <ProjectDetailModal
          project={detailModalProject}
          allUsers={allUsers}
          activeOkrs={activeOkrs}
          currentUser={currentUser}
          onClose={() => setDetailModalProject(null)}
          onUpdateProject={onUpdateProject}
          onOpenRoleModal={(roleKey, roleName) => onOpenModal('role', detailModalProject.id, { roleKey, roleName })}
          onToggleFollow={onToggleFollow}
        />
      )}
    </main>
  );
};