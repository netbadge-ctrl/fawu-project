import React, { useState, useEffect, useMemo } from 'react';
import { MonthlyWorkItem, User } from '../types';
import { api } from '../api.ts';
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconCheck, IconX } from './Icons';

interface MonthlyMeetingViewProps {
  currentUser: User;
}

export const MonthlyMeetingView: React.FC<MonthlyMeetingViewProps> = ({ currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workItems, setWorkItems] = useState<MonthlyWorkItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // 筛选状态
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedProductOwner, setSelectedProductOwner] = useState<string>('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // 加载当前月份的工作条目
  useEffect(() => {
    loadWorkItems();
  }, [year, month]);

  const loadWorkItems = async () => {
    setIsLoading(true);
    try {
      const items = await api.fetchMonthlyWorkItemsByMonth(year, month);
      setWorkItems(items || []);
    } catch (error) {
      console.error('Failed to load work items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const handleCreateWorkItem = () => {
    const newItem: MonthlyWorkItem = {
      id: `temp_${Date.now()}`,
      year,
      month,
      workContent: '',
      isCompleted: false,
      createdBy: currentUser.id,
    };
    setWorkItems(prev => [newItem, ...prev]);
    setEditingId(newItem.id);
  };

  const handleSaveWorkItem = async (item: MonthlyWorkItem) => {
    if (!item.workContent.trim()) {
      alert('工作内容不能为空');
      return;
    }

    setIsLoading(true);
    try {
      if (item.id.startsWith('temp_')) {
        // 创建新条目
        const created = await api.createMonthlyWorkItem({
          ...item,
          id: undefined, // 让后端生成ID
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        });
        setWorkItems(prev => prev.map(i => i.id === item.id ? created : i));
      } else {
        // 更新现有条目
        await api.updateMonthlyWorkItem(item.id, {
          ...item,
          updated_by: currentUser.id,
        });
      }
      setEditingId(null);
      await loadWorkItems();
    } catch (error) {
      console.error('Failed to save work item:', error);
      alert('保存失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWorkItem = async (itemId: string) => {
    if (!confirm('确定要删除这条工作记录吗？')) return;

    if (itemId.startsWith('temp_')) {
      setWorkItems(prev => prev.filter(i => i.id !== itemId));
      setEditingId(null);
      return;
    }

    setIsLoading(true);
    try {
      await api.deleteMonthlyWorkItem(itemId);
      await loadWorkItems();
    } catch (error) {
      console.error('Failed to delete work item:', error);
      alert('删除失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = (itemId: string, field: keyof MonthlyWorkItem, value: any) => {
    setWorkItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const handleCancelEdit = (itemId: string) => {
    if (itemId.startsWith('temp_')) {
      setWorkItems(prev => prev.filter(i => i.id !== itemId));
    }
    setEditingId(null);
    loadWorkItems();
  };

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() + 1 === month;
  }, [year, month]);

  // 获取所有唯一的方向和负责产品
  const uniqueDirections = useMemo(() => {
    const directions = new Set<string>();
    workItems.forEach(item => {
      if (item.direction) directions.add(item.direction);
    });
    return Array.from(directions).sort();
  }, [workItems]);

  const uniqueProductOwners = useMemo(() => {
    const owners = new Set<string>();
    workItems.forEach(item => {
      if (item.productOwner) owners.add(item.productOwner);
    });
    return Array.from(owners).sort();
  }, [workItems]);

  // 筛选和排序后的工作条目
  const filteredAndSortedWorkItems = useMemo(() => {
    let filtered = [...workItems];

    // 筛选：方向
    if (selectedDirection) {
      filtered = filtered.filter(item => item.direction === selectedDirection);
    }

    // 筛选：负责产品
    if (selectedProductOwner) {
      filtered = filtered.filter(item => item.productOwner === selectedProductOwner);
    }

    // 排序：按负责产品、创建时间
    filtered.sort((a, b) => {
      // 1. 按负责产品排序
      const ownerA = a.productOwner || '';
      const ownerB = b.productOwner || '';
      if (ownerA !== ownerB) {
        return ownerA.localeCompare(ownerB, 'zh-CN');
      }

      // 2. 按创建时间排序（降序，最新的在前）
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return filtered;
  }, [workItems, selectedDirection, selectedProductOwner]);

  return (
    <div className="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-[#1A1A1A]">
      <div className="max-w-full mx-auto">
        {/* 头部 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">产品月会</h1>
              <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#4a4a4a] hover:bg-gray-50 dark:hover:bg-[#3a3a3a] transition-colors"
                title="上一月"
              >
                <IconChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              <div className="px-4 py-2 rounded-lg bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#4a4a4a] min-w-[140px] text-center">
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {year}年{month}月
                </span>
                {isCurrentMonth && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-[#6C63FF] text-white rounded-full">
                    当前
                  </span>
                )}
              </div>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#4a4a4a] hover:bg-gray-50 dark:hover:bg-[#3a3a3a] transition-colors"
                title="下一月"
              >
                <IconChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              </div>
            </div>
            <button
              onClick={handleCreateWorkItem}
              className="flex items-center gap-2 px-4 py-2 bg-[#6C63FF] text-white rounded-lg hover:bg-[#5a52d5] transition-colors"
            >
              <IconPlus className="w-5 h-5" />
              <span>新增工作</span>
            </button>
          </div>

          {/* 筛选栏 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                方向：
              </label>
              <select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
              >
                <option value="">全部</option>
                {uniqueDirections.map(dir => (
                  <option key={dir} value={dir}>{dir}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                负责产品：
              </label>
              <select
                value={selectedProductOwner}
                onChange={(e) => setSelectedProductOwner(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
              >
                <option value="">全部</option>
                {uniqueProductOwners.map(owner => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
            </div>

            {(selectedDirection || selectedProductOwner) && (
              <button
                onClick={() => {
                  setSelectedDirection('');
                  setSelectedProductOwner('');
                }}
                className="text-sm text-[#6C63FF] hover:text-[#5a52d5] transition-colors"
              >
                清除筛选
              </button>
            )}

            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
              共 {filteredAndSortedWorkItems.length} 条记录
            </div>
          </div>
        </div>

        {/* 表格 */}
        <div className="bg-white dark:bg-[#2d2d2d] rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#1F1F1F] border-b border-gray-200 dark:border-[#363636]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[200px]">
                    工作内容
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[200px]">
                    解决的业务问题
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                    方向
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                    负责产品
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                    预计完成时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[180px]">
                    当前产品进展
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[100px]">
                    是否完成
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[180px]">
                    进展说明
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[100px]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#363636]">
                {filteredAndSortedWorkItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {workItems.length === 0 ? '暂无工作记录，点击"新增工作"开始添加' : '没有符合筛选条件的记录'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedWorkItems.map(item => (
                    <WorkItemRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      onEdit={() => setEditingId(item.id)}
                      onSave={() => handleSaveWorkItem(item)}
                      onCancel={() => handleCancelEdit(item.id)}
                      onDelete={() => handleDeleteWorkItem(item.id)}
                      onUpdateField={handleUpdateField}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-[#2d2d2d] rounded-lg p-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6C63FF] mx-auto"></div>
              <p className="mt-4 text-gray-700 dark:text-gray-300">加载中...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface WorkItemRowProps {
  item: MonthlyWorkItem;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUpdateField: (itemId: string, field: keyof MonthlyWorkItem, value: any) => void;
}

const WorkItemRow: React.FC<WorkItemRowProps> = ({
  item,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onUpdateField,
}) => {
  const tdClass = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300 align-middle";
  const inputClass = "w-full px-2 py-1.5 bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] rounded text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]";

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors">
      {/* 工作内容 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={item.workContent}
            onChange={(e) => onUpdateField(item.id, 'workContent', e.target.value)}
            className={inputClass}
            placeholder="输入工作内容"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{item.workContent || '-'}</div>
        )}
      </td>

      {/* 解决的业务问题 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={item.businessProblem || ''}
            onChange={(e) => onUpdateField(item.id, 'businessProblem', e.target.value)}
            className={inputClass}
            placeholder="输入业务问题"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{item.businessProblem || '-'}</div>
        )}
      </td>

      {/* 方向 */}
      <td className={tdClass}>
        {isEditing ? (
          <select
            value={item.direction || ''}
            onChange={(e) => onUpdateField(item.id, 'direction', e.target.value)}
            className={inputClass}
          >
            <option value="">选择方向</option>
            <option value="业务平台">业务平台</option>
            <option value="基础平台">基础平台</option>
          </select>
        ) : (
          <span>{item.direction || '-'}</span>
        )}
      </td>

      {/* 负责产品 */}
      <td className={tdClass}>
        {isEditing ? (
          <input
            type="text"
            value={item.productOwner || ''}
            onChange={(e) => onUpdateField(item.id, 'productOwner', e.target.value)}
            className={inputClass}
            placeholder="负责人"
          />
        ) : (
          <span>{item.productOwner || '-'}</span>
        )}
      </td>

      {/* 预计完成时间 */}
      <td className={tdClass}>
        {isEditing ? (
          <select
            value={item.expectedCompletionWeek || ''}
            onChange={(e) => onUpdateField(item.id, 'expectedCompletionWeek', e.target.value)}
            className={inputClass}
          >
            <option value="">选择周次</option>
            <option value="第一周">第一周</option>
            <option value="第二周">第二周</option>
            <option value="第三周">第三周</option>
            <option value="第四周">第四周</option>
          </select>
        ) : (
          <span>{item.expectedCompletionWeek || '-'}</span>
        )}
      </td>

      {/* 当前产品进展 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={item.currentProgress || ''}
            onChange={(e) => onUpdateField(item.id, 'currentProgress', e.target.value)}
            className={inputClass}
            placeholder="输入进展"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{item.currentProgress || '-'}</div>
        )}
      </td>

      {/* 是否完成 */}
      <td className={`${tdClass} text-center`}>
        {isEditing ? (
          <select
            value={item.isCompleted ? '是' : '否'}
            onChange={(e) => onUpdateField(item.id, 'isCompleted', e.target.value === '是')}
            className={inputClass}
          >
            <option value="否">否</option>
            <option value="是">是</option>
          </select>
        ) : (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            item.isCompleted 
              ? 'bg-green-100 text-green-800 dark:bg-green-600/50 dark:text-green-200' 
              : 'bg-gray-100 text-gray-800 dark:bg-gray-600/50 dark:text-gray-200'
          }`}>
            {item.isCompleted ? '是' : '否'}
          </span>
        )}
      </td>

      {/* 进展说明 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={item.progressNotes || ''}
            onChange={(e) => onUpdateField(item.id, 'progressNotes', e.target.value)}
            className={inputClass}
            placeholder="输入说明"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{item.progressNotes || '-'}</div>
        )}
      </td>

      {/* 操作 */}
      <td className={`${tdClass} text-center`}>
        {isEditing ? (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onSave}
              className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
              title="保存"
            >
              <IconCheck className="w-5 h-5" />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
              title="取消"
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onEdit}
              className="px-3 py-1 text-sm text-[#6C63FF] hover:bg-[#6C63FF]/10 rounded transition-colors"
            >
              编辑
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="删除"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};
