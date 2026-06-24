import React, { useState, useEffect, useMemo } from 'react';
import { AIResearchTask, User } from '../types';
import { api } from '../api.ts';
import { IconPlus, IconTrash, IconCheck, IconX } from './Icons';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface AIResearchTaskTrackerProps {
  currentUser: User;
}

const STATUS_OPTIONS = ['调研中', '实验中', '验证中', '已完成', '已暂停'] as const;
const OUTPUT_OPTIONS = ['调研报告', 'Prompt 模板', '原型', '上线方案', '其他'] as const;

export const AIResearchTaskTracker: React.FC<AIResearchTaskTrackerProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<AIResearchTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // 筛选状态
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);

  useEffect(() => {
    loadUsers();
    loadTasks();
  }, []);

  const loadUsers = async () => {
    try {
      const users = await api.fetchUsers();
      setAllUsers(users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const items = await api.fetchAIResearchTasks();
      setTasks(items || []);
    } catch (error) {
      console.error('Failed to load AI research tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = () => {
    const newTask: AIResearchTask = {
      id: `temp_${Date.now()}`,
      title: '',
      isCompleted: false,
      createdBy: currentUser.id,
    };
    setTasks(prev => [newTask, ...prev]);
    setEditingId(newTask.id);
  };

  const handleSaveTask = async (task: AIResearchTask) => {
    if (!task.title.trim()) {
      alert('研究主题 / 任务名称不能为空');
      return;
    }

    setIsLoading(true);
    try {
      if (task.id.startsWith('temp_')) {
        const { id: _, ...taskWithoutId } = task;
        const created = await api.createAIResearchTask({
          ...taskWithoutId,
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        });
        setTasks(prev => prev.map(t => t.id === task.id ? created : t));
      } else {
        await api.updateAIResearchTask(task.id, {
          ...task,
          updatedBy: currentUser.id,
        });
      }
      setEditingId(null);
      await loadTasks();
    } catch (error) {
      console.error('Failed to save AI research task:', error);
      alert('保存失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这条 AI 研究任务吗？')) return;

    if (taskId.startsWith('temp_')) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setEditingId(null);
      return;
    }

    setIsLoading(true);
    try {
      await api.deleteAIResearchTask(taskId);
      await loadTasks();
    } catch (error) {
      console.error('Failed to delete AI research task:', error);
      alert('删除失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = (taskId: string, field: keyof AIResearchTask, value: any) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, [field]: value } : task
    ));
  };

  const handleCancelEdit = (taskId: string) => {
    if (taskId.startsWith('temp_')) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
    setEditingId(null);
    loadTasks();
  };

  const allOwners = useMemo(() => {
    const owners = new Set<string>();
    tasks.forEach(task => {
      if (task.owner) owners.add(task.owner);
    });
    return Array.from(owners).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [tasks]);

  const filteredAndSortedTasks = useMemo(() => {
    let filtered = [...tasks];

    if (selectedStatus) {
      filtered = filtered.filter(task => task.status === selectedStatus);
    }

    if (selectedOwners.length > 0) {
      filtered = filtered.filter(task => selectedOwners.includes(task.owner || ''));
    }

    if (selectedOutputs.length > 0) {
      filtered = filtered.filter(task => selectedOutputs.includes(task.expectedOutput || ''));
    }

    filtered.sort((a, b) => {
      const ownerA = a.owner || '';
      const ownerB = b.owner || '';
      if (ownerA !== ownerB) {
        return ownerA.localeCompare(ownerB, 'zh-CN');
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return filtered;
  }, [tasks, selectedStatus, selectedOwners, selectedOutputs]);

  return (
    <div className="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-[#1A1A1A]">
      <div className="max-w-full mx-auto">
        {/* 头部 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI 研究任务追踪</h1>
            <button
              onClick={handleCreateTask}
              className="flex items-center gap-2 px-4 py-2 bg-[#6C63FF] text-white rounded-lg hover:bg-[#5a52d5] transition-colors"
            >
              <IconPlus className="w-5 h-5" />
              <span>新增任务</span>
            </button>
          </div>

          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                状态：
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
              >
                <option value="">全部</option>
                {STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                负责人：
              </label>
              <div className="min-w-[180px]">
                <MultiSelectDropdown
                  options={allOwners.map(name => ({ value: name, label: name }))}
                  selectedValues={selectedOwners}
                  onSelectionChange={setSelectedOwners}
                  placeholder="全部"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                预期产出：
              </label>
              <div className="min-w-[180px]">
                <MultiSelectDropdown
                  options={OUTPUT_OPTIONS.map(output => ({ value: output, label: output }))}
                  selectedValues={selectedOutputs}
                  onSelectionChange={setSelectedOutputs}
                  placeholder="全部"
                />
              </div>
            </div>

            {(selectedStatus || selectedOwners.length > 0 || selectedOutputs.length > 0) && (
              <button
                onClick={() => {
                  setSelectedStatus('');
                  setSelectedOwners([]);
                  setSelectedOutputs([]);
                }}
                className="text-sm text-[#6C63FF] hover:text-[#5a52d5] transition-colors"
              >
                清除筛选
              </button>
            )}

            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
              共 {filteredAndSortedTasks.length} 条记录
            </div>
          </div>
        </div>

        {/* 表格 */}
        <div className="bg-white dark:bg-[#2d2d2d] rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#1F1F1F] border-b border-gray-200 dark:border-[#363636]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[180px]">
                    研究主题 / 任务名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[200px]">
                    研究背景与目标
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[100px]">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                    负责人
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[130px]">
                    预期产出
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[180px]">
                    当前进展 / 关键结论
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[150px]">
                    阻塞项 / 依赖
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                    计划完成时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[150px]">
                    备注
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[90px]">
                    是否完成
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[100px]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#363636]">
                {filteredAndSortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {tasks.length === 0 ? '暂无 AI 研究任务，点击"新增任务"开始添加' : '没有符合筛选条件的记录'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isEditing={editingId === task.id}
                      onEdit={() => setEditingId(task.id)}
                      onSave={() => handleSaveTask(task)}
                      onCancel={() => handleCancelEdit(task.id)}
                      onDelete={() => handleDeleteTask(task.id)}
                      onUpdateField={handleUpdateField}
                      allUserNames={allUsers.map(u => u.name).sort((a, b) => a.localeCompare(b, 'zh-CN'))}
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

interface TaskRowProps {
  task: AIResearchTask;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUpdateField: (taskId: string, field: keyof AIResearchTask, value: any) => void;
  allUserNames: string[];
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onUpdateField,
  allUserNames,
}) => {
  const tdClass = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300 align-middle";
  const inputClass = "w-full px-2 py-1.5 bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] rounded text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]";

  const statusBadgeClass = (status?: string) => {
    switch (status) {
      case '已完成':
        return 'bg-green-100 text-green-800 dark:bg-green-600/50 dark:text-green-200';
      case '已暂停':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-600/50 dark:text-gray-200';
      case '实验中':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-600/50 dark:text-blue-200';
      case '验证中':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-600/50 dark:text-yellow-200';
      case '调研中':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-600/50 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-600/50 dark:text-gray-200';
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors">
      {/* 研究主题 / 任务名称 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={task.title}
            onChange={(e) => onUpdateField(task.id, 'title', e.target.value)}
            className={inputClass}
            placeholder="输入研究主题 / 任务名称"
            rows={2}
          />
        ) : (
          <div className="font-medium text-gray-900 dark:text-white whitespace-pre-wrap">{task.title || '-'}</div>
        )}
      </td>

      {/* 研究背景与目标 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={task.background || ''}
            onChange={(e) => onUpdateField(task.id, 'background', e.target.value)}
            className={inputClass}
            placeholder="输入研究背景与目标"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{task.background || '-'}</div>
        )}
      </td>

      {/* 状态 */}
      <td className={tdClass}>
        {isEditing ? (
          <select
            value={task.status || ''}
            onChange={(e) => onUpdateField(task.id, 'status', e.target.value)}
            className={inputClass}
          >
            <option value="">选择状态</option>
            {STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        ) : (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(task.status)}`}>
            {task.status || '-'}
          </span>
        )}
      </td>

      {/* 负责人 */}
      <td className={tdClass}>
        {isEditing ? (
          <select
            value={task.owner || ''}
            onChange={(e) => onUpdateField(task.id, 'owner', e.target.value)}
            className={inputClass}
          >
            <option value="">请选择</option>
            {allUserNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <span>{task.owner || '-'}</span>
        )}
      </td>

      {/* 预期产出 */}
      <td className={tdClass}>
        {isEditing ? (
          <select
            value={task.expectedOutput || ''}
            onChange={(e) => onUpdateField(task.id, 'expectedOutput', e.target.value)}
            className={inputClass}
          >
            <option value="">选择预期产出</option>
            {OUTPUT_OPTIONS.map(output => (
              <option key={output} value={output}>{output}</option>
            ))}
          </select>
        ) : (
          <span>{task.expectedOutput || '-'}</span>
        )}
      </td>

      {/* 当前进展 / 关键结论 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={task.progress || ''}
            onChange={(e) => onUpdateField(task.id, 'progress', e.target.value)}
            className={inputClass}
            placeholder="输入当前进展 / 关键结论"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{task.progress || '-'}</div>
        )}
      </td>

      {/* 阻塞项 / 依赖 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={task.blockers || ''}
            onChange={(e) => onUpdateField(task.id, 'blockers', e.target.value)}
            className={inputClass}
            placeholder="输入阻塞项 / 依赖"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{task.blockers || '-'}</div>
        )}
      </td>

      {/* 计划完成时间 */}
      <td className={tdClass}>
        {isEditing ? (
          <input
            type="date"
            value={task.plannedCompletionDate || ''}
            onChange={(e) => onUpdateField(task.id, 'plannedCompletionDate', e.target.value)}
            className={inputClass}
          />
        ) : (
          <span>{task.plannedCompletionDate || '-'}</span>
        )}
      </td>

      {/* 备注 */}
      <td className={tdClass}>
        {isEditing ? (
          <textarea
            value={task.notes || ''}
            onChange={(e) => onUpdateField(task.id, 'notes', e.target.value)}
            className={inputClass}
            placeholder="输入备注"
            rows={2}
          />
        ) : (
          <div className="whitespace-pre-wrap">{task.notes || '-'}</div>
        )}
      </td>

      {/* 是否完成 */}
      <td className={`${tdClass} text-center`}>
        {isEditing ? (
          <select
            value={task.isCompleted ? '是' : '否'}
            onChange={(e) => onUpdateField(task.id, 'isCompleted', e.target.value === '是')}
            className={inputClass}
          >
            <option value="否">否</option>
            <option value="是">是</option>
          </select>
        ) : (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            task.isCompleted
              ? 'bg-green-100 text-green-800 dark:bg-green-600/50 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-600/50 dark:text-gray-200'
          }`}>
            {task.isCompleted ? '是' : '否'}
          </span>
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
