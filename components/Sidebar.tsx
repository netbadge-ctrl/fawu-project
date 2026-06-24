import React, { useState } from 'react';
import { IconG, IconList, IconBarChart, IconLayoutGrid, IconUser, IconLogOut, IconSun, IconMoon, IconClipboard, IconChevronLeft, IconChevronRight, IconCalendar, IconFileText } from './Icons';
import { ViewType } from '../App';
import { User } from '../types';
import { useTheme } from '../context/theme-context';
import { useAuth } from '../context/auth-context';

interface SidebarProps {
  view: ViewType;
  setView: (view: ViewType) => void;
  currentUser: User;
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  collapsed: boolean;
}> = ({ icon, label, isActive, onClick, collapsed }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${
        isActive ? 'bg-[#6C63FF] text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : ""}
    >
      {icon}
      {!collapsed && <span className="ml-4 font-medium">{label}</span>}
    </a>
  </li>
);

export const Sidebar: React.FC<SidebarProps> = ({ view, setView, currentUser }) => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout();
    }
  };
  
  return (
    <aside className={`${collapsed ? 'w-20' : 'w-52'} transition-all duration-300 bg-gray-100 dark:bg-[#1F1F1F] border-r border-gray-200 dark:border-[#363636] flex flex-col p-4 flex-shrink-0`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconG className="w-8 h-8"/>
            <button
              onClick={() => setView('aiResearch')}
              className="absolute -top-1 -right-1 p-1 rounded-full bg-[#6C63FF] text-white hover:bg-[#5a52d5] transition-colors shadow-lg"
              aria-label="AI 研究任务追踪"
              title="AI 研究任务追踪"
            >
              <IconCalendar className="w-3 h-3" />
            </button>
          </div>
          {!collapsed && <span className="text-xl font-bold text-gray-900 dark:text-white">项目中心</span>}
        </div>
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          aria-label={collapsed ? "展开菜单" : "收起菜单"}
          title={collapsed ? "展开菜单" : "收起菜单"}
        >
          {collapsed ? <IconChevronRight className="w-4 h-4" /> : <IconChevronLeft className="w-4 h-4" />}
        </button>
      </div>
      <nav className="flex-1">
        <ul className="space-y-2">
           <NavItem
            icon={<IconUser className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="个人视图"
            isActive={view === 'personal'}
            onClick={() => setView('personal')}
            collapsed={collapsed}
          />
          <NavItem
            icon={<IconList className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="项目总览"
            isActive={view === 'overview'}
            onClick={() => setView('overview')}
            collapsed={collapsed}
          />

          <NavItem
            icon={<IconBarChart className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="OKR"
            isActive={view === 'okr'}
            onClick={() => setView('okr')}
            collapsed={collapsed}
          />
          <NavItem
            icon={<IconLayoutGrid className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="看板"
            isActive={view === 'kanban'}
            onClick={() => setView('kanban')}
            collapsed={collapsed}
          />
          <NavItem
            icon={<IconClipboard className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="周会视图"
            isActive={view === 'weekly'}
            onClick={() => setView('weekly')}
            collapsed={collapsed}
          />
          <NavItem
            icon={<IconFileText className={`${collapsed ? 'w-7 h-7' : 'w-6 h-6'}`} />}
            label="周报"
            isActive={view === 'weeklyReport'}
            onClick={() => setView('weeklyReport')}
            collapsed={collapsed}
          />
        </ul>
      </nav>
      <div className="mt-auto">
        <div className="p-3 border-t border-gray-200 dark:border-[#363636]">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div className="flex-grow">
                <p className="font-semibold text-gray-900 dark:text-white">{currentUser.name}</p>
              </div>
            )}
            <div className="flex items-center gap-1">
                <button onClick={toggleTheme} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#3a3a3a] transition-colors" aria-label="切换主题" title="切换主题">
                    {theme === 'dark' ? <IconSun className="w-5 h-5" /> : <IconMoon className="w-5 h-5" />}
                </button>
                <button onClick={handleLogout} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-[#3a3a3a] transition-colors" aria-label="退出登录" title="退出登录">
                    <IconLogOut className="w-5 h-5" />
                </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};