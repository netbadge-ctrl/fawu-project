import React, { useState } from 'react';

// 可用的排序字段
export type SortField =
  | 'name'
  | 'status'
  | 'priority'
  | 'keyResults'
  | 'owners'
  | 'createdAt';

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  id: string;
  field: SortField;
  direction: SortDirection;
}

interface MultiSortConfigProps {
  sortRules: SortRule[];
  onSortRulesChange: (rules: SortRule[]) => void;
  onClose: () => void;
}

// 字段显示名称映射
const fieldLabels: Record<SortField, string> = {
  name: '项目名称',
  status: '开发状态',
  priority: '优先级',
  keyResults: '对应OKR',
  owners: '负责人',
  createdAt: '创建时间',
};

export const MultiSortConfig: React.FC<MultiSortConfigProps> = ({
  sortRules,
  onSortRulesChange,
  onClose,
}) => {
  const [localRules, setLocalRules] = useState<SortRule[]>(sortRules);
  const [autoSort, setAutoSort] = useState(false);

  // 添加新的排序规则
  const handleAddRule = () => {
    const availableFields = (Object.keys(fieldLabels) as SortField[]).filter(
      field => !localRules.some(rule => rule.field === field)
    );
    
    if (availableFields.length > 0) {
      const newRule: SortRule = {
        id: `rule_${Date.now()}`,
        field: availableFields[0],
        direction: 'asc',
      };
      setLocalRules([...localRules, newRule]);
    }
  };

  // 删除排序规则
  const handleRemoveRule = (id: string) => {
    setLocalRules(localRules.filter(rule => rule.id !== id));
  };

  // 更新排序字段
  const handleFieldChange = (id: string, field: SortField) => {
    setLocalRules(localRules.map(rule => 
      rule.id === id ? { ...rule, field } : rule
    ));
  };

  // 更新排序方向
  const handleDirectionChange = (id: string, direction: SortDirection) => {
    setLocalRules(localRules.map(rule => 
      rule.id === id ? { ...rule, direction } : rule
    ));
  };

  // 移动规则位置
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    const newRules = [...localRules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newRules.length) {
      [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
      setLocalRules(newRules);
    }
  };

  // 应用排序规则
  const handleApply = () => {
    onSortRulesChange(localRules);
    onClose();
  };

  // 获取可用的字段选项
  const getAvailableFields = (currentField: SortField): SortField[] => {
    return (Object.keys(fieldLabels) as SortField[]).filter(
      field => field === currentField || !localRules.some(rule => rule.field === field)
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#232323] rounded-lg shadow-xl w-[520px] max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-[#363636] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              设置排序条件
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoSort}
                onChange={(e) => setAutoSort(e.target.checked)}
                className="rounded border-gray-300 dark:border-[#4a4a4a]"
              />
              自动排序
            </label>
          </div>
        </div>

        {/* 排序规则列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {localRules.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              暂无排序条件，点击下方"+ 排序条件"添加
            </div>
          ) : (
            <div className="space-y-3">
              {localRules.map((rule, index) => {
                const availableFields = getAvailableFields(rule.field);
                
                return (
                  <div
                    key={rule.id}
                    className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-[#2d2d2d] rounded-lg border border-gray-200 dark:border-[#363636]"
                  >
                    {/* 拖拽手柄 */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveRule(index, 'up')}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveRule(index, 'down')}
                        disabled={index === localRules.length - 1}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▼
                      </button>
                    </div>

                    {/* 字段选择 */}
                    <div className="flex-1">
                      <select
                        value={rule.field}
                        onChange={(e) => handleFieldChange(rule.id, e.target.value as SortField)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded-md bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 text-sm"
                      >
                        {availableFields.map(field => (
                          <option key={field} value={field}>
                            {fieldLabels[field]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 排序方向按钮 */}
                    <div className="flex gap-1 bg-white dark:bg-[#1e1e1e] rounded-md border border-gray-300 dark:border-[#4a4a4a] p-1">
                      <button
                        onClick={() => handleDirectionChange(rule.id, 'asc')}
                        className={`px-3 py-1 text-sm rounded ${
                          rule.direction === 'asc'
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2d2d2d]'
                        }`}
                      >
                        A → Z
                      </button>
                      <button
                        onClick={() => handleDirectionChange(rule.id, 'desc')}
                        className={`px-3 py-1 text-sm rounded ${
                          rule.direction === 'desc'
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2d2d2d]'
                        }`}
                      >
                        Z → A
                      </button>
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveRule(rule.id)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6 6L14 14M6 14L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 添加排序条件按钮 */}
          {localRules.length < Object.keys(fieldLabels).length && (
            <button
              onClick={handleAddRule}
              className="mt-4 w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md border border-dashed border-blue-300 dark:border-blue-700"
            >
              + 排序条件
            </button>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-[#363636] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2d2d2d] rounded-md"
          >
            取消
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
};
