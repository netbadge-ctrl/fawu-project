import React from 'react';

// 通用骨架屏组件
export const SkeletonBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
);

// 个人视图骨架屏
export const PersonalViewSkeleton: React.FC = () => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-gray-100 dark:bg-[#1f1f1f]">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
        {/* 年度统计骨架屏 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-xl bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636]">
              <div className="flex items-center gap-4">
                <SkeletonBox className="w-12 h-12 rounded-lg" />
                <div className="flex-1">
                  <SkeletonBox className="h-4 w-24 mb-2" />
                  <SkeletonBox className="h-8 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* 项目卡片骨架屏 */}
          <div className="lg:col-span-3 space-y-8">
            {[1, 2].map(section => (
              <section key={section}>
                <SkeletonBox className="h-6 w-48 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[1, 2, 3].map(card => (
                    <div key={card} className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl p-6">
                      <SkeletonBox className="h-5 w-3/4 mb-3" />
                      <SkeletonBox className="h-4 w-1/2 mb-4" />
                      <div className="space-y-2">
                        <SkeletonBox className="h-3 w-full" />
                        <SkeletonBox className="h-3 w-5/6" />
                      </div>
                      <div className="mt-4 flex gap-2">
                        <SkeletonBox className="h-6 w-16" />
                        <SkeletonBox className="h-6 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* 活动流骨架屏 */}
          <div className="lg:col-span-1">
            <SkeletonBox className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-lg p-3">
                  <div className="flex gap-2 mb-2">
                    <SkeletonBox className="w-6 h-6 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <SkeletonBox className="h-3 w-20 mb-1" />
                      <SkeletonBox className="h-2 w-16" />
                    </div>
                  </div>
                  <SkeletonBox className="h-3 w-full mb-1" />
                  <SkeletonBox className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

// 项目总览骨架屏
export const ProjectOverviewSkeleton: React.FC = () => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* 顶部操作栏骨架屏 */}
        <div className="mb-6 flex gap-4 items-center">
          <SkeletonBox className="h-10 w-64" />
          <SkeletonBox className="h-10 w-32" />
          <SkeletonBox className="h-10 w-32" />
          <div className="flex-1" />
          <SkeletonBox className="h-10 w-24" />
        </div>

        {/* 表格骨架屏 */}
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl overflow-hidden">
          {/* 表头 */}
          <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-[#363636]">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <SkeletonBox key={i} className="h-4 flex-1" />
            ))}
          </div>
          
          {/* 表格行 */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(row => (
            <div key={row} className="flex gap-2 p-4 border-b border-gray-200 dark:border-[#363636]">
              {[1, 2, 3, 4, 5, 6, 7].map(col => (
                <div key={col} className="flex-1">
                  <SkeletonBox className="h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};

// OKR页面骨架屏
export const OKRPageSkeleton: React.FC = () => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* 顶部操作栏 */}
          <div className="flex justify-between items-center mb-6">
            <SkeletonBox className="h-10 w-48" />
            <SkeletonBox className="h-10 w-32" />
          </div>

          {/* OKR卡片骨架屏 */}
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl p-6">
                <div className="flex gap-4 mb-4">
                  <SkeletonBox className="w-8 h-8 rounded" />
                  <div className="flex-1">
                    <SkeletonBox className="h-6 w-3/4 mb-2" />
                    <SkeletonBox className="h-4 w-1/2" />
                  </div>
                </div>
                
                {/* KR列表 */}
                <div className="ml-12 space-y-3">
                  {[1, 2, 3].map(kr => (
                    <div key={kr} className="flex gap-3">
                      <SkeletonBox className="w-6 h-6 rounded" />
                      <SkeletonBox className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};

// 看板视图骨架屏
export const KanbanViewSkeleton: React.FC = () => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* 控制栏 */}
        <div className="mb-6 flex gap-4">
          <SkeletonBox className="h-10 w-32" />
          <SkeletonBox className="h-10 w-32" />
        </div>

        {/* 甘特图头部 */}
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl overflow-hidden mb-4">
          <div className="flex">
            <SkeletonBox className="w-48 h-12 border-r border-gray-200 dark:border-[#363636]" />
            <div className="flex-1 flex">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <SkeletonBox key={i} className="flex-1 h-12 border-r border-gray-200 dark:border-[#363636]" />
              ))}
            </div>
          </div>
        </div>

        {/* 甘特图行 */}
        <div className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(row => (
            <div key={row} className="flex border-b border-gray-200 dark:border-[#363636] h-16">
              <div className="w-48 border-r border-gray-200 dark:border-[#363636] p-3">
                <SkeletonBox className="h-4 w-24" />
              </div>
              <div className="flex-1 relative p-3">
                <SkeletonBox className="h-8" style={{ width: `${30 + Math.random() * 40}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};
