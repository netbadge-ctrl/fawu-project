import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { IconChevronDown, IconSearch } from './Icons';
import { fuzzySearch } from '../utils';

interface Option {
    value: string;
    label: string;
    email?: string; // 添加邮箱字段用于拼音匹配
}

interface GroupedOption {
    label: string;
    options: Option[];
}

interface MultiSelectDropdownProps {
    options?: Option[];
    groupedOptions?: GroupedOption[];
    selectedValues: string[];
    onSelectionChange: (newSelectedValues: string[]) => void;
    placeholder: string;
    userData?: Array<{ id: string; name: string; email: string }>; // 添加用户数据
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
    options = [],
    groupedOptions,
    selectedValues,
    onSelectionChange,
    placeholder,
    userData = []
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null); // 新增：当前选中的部门
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 320 });
    const dropdownContentRef = useRef<HTMLDivElement>(null);
    
    // 计算下拉菜单位置
    const calculatePosition = useCallback(() => {
        if (!dropdownRef.current) return;
        
        const rect = dropdownRef.current.getBoundingClientRect();
        const dropdownHeight = 400; // 下拉菜单预估高度
        const dropdownWidth = groupedOptions ? 600 : 320; // 分组模式下使用更宽的宽度
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const margin = 8;
        
        let top = rect.bottom + margin;
        let left = rect.left;
        
        // 检查下方空间是否足够
        if (top + dropdownHeight > viewportHeight) {
            // 向上展开
            top = rect.top - dropdownHeight - margin;
            // 如果上方空间也不够，则置于屏幕中央
            if (top < margin) {
                top = Math.max(margin, (viewportHeight - dropdownHeight) / 2);
            }
        }
        
        // 检查右侧空间是否足够
        if (left + dropdownWidth > viewportWidth) {
            left = viewportWidth - dropdownWidth - margin;
        }
        
        // 确保不超出左边界
        if (left < margin) {
            left = margin;
        }
        
        setDropdownPosition({ top, left, width: dropdownWidth });
    }, [groupedOptions]);
    
    // 预缓存选项数据，避免每次搜索时重复处理
    const processedOptions = useMemo(() => {
        const allOptions = groupedOptions ? groupedOptions.flatMap(g => g.options) : options;
        return allOptions.map(option => {
            // 从userData中查找对应的邮箱信息
            const user = userData.find(u => u.id === option.value);
            const emailPrefix = user?.email ? user.email.split('@')[0].toLowerCase() : '';
            
            return {
                ...option,
                searchableText: option.label.toLowerCase(),
                emailPrefix: emailPrefix
            };
        });
    }, [options, groupedOptions, userData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // 检查点击是否在触发按钮或下拉菜单内容内
            const isClickInTrigger = dropdownRef.current?.contains(target);
            const isClickInDropdown = dropdownContentRef.current?.contains(target);
            
            if (!isClickInTrigger && !isClickInDropdown) {
                setIsOpen(false);
            }
        };
        
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isOpen]);

    // 完全移除防抖，直接使用搜索词
    useEffect(() => {
        setDebouncedSearchTerm(searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        if (isOpen) {
            // 只在刚打开时重置搜索条件
            if (!selectedDepartment) {
                setSearchTerm('');
                setDebouncedSearchTerm('');
            }
            // 默认选中"全部"部门（如果有分组且没有已选部门）
            if (groupedOptions && groupedOptions.length > 0 && !selectedDepartment) {
                setSelectedDepartment('__all__');
            }
            calculatePosition();
            setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
            // 关闭时重置选中的部门和搜索条件
            setSelectedDepartment(null);
            setSearchTerm('');
            setDebouncedSearchTerm('');
        }
    }, [isOpen, calculatePosition, groupedOptions]);

    // 监听窗口变化重新计算位置
    useEffect(() => {
        if (isOpen) {
            const handleResize = () => calculatePosition();
            const handleScroll = () => calculatePosition();
            
            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleScroll, true);
            
            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [isOpen, calculatePosition]);

    const handleToggleOption = useCallback((value: string) => {
        const newSelectedValues = selectedValues.includes(value)
            ? selectedValues.filter(v => v !== value)
            : [...selectedValues, value];
        onSelectionChange(newSelectedValues);
    }, [selectedValues, onSelectionChange, placeholder]);

    const displayLabel = selectedValues.length > 0 
        ? `${placeholder} (${selectedValues.length})`
        : placeholder;

    const { flatFilteredOptions, filteredGroupedOptions } = useMemo(() => {
        // 如果没有搜索词，直接返回所有选项
        if (!debouncedSearchTerm.trim()) {
            if (groupedOptions) {
                return {
                    flatFilteredOptions: groupedOptions.flatMap(g => g.options),
                    filteredGroupedOptions: groupedOptions,
                };
            }
            return {
                flatFilteredOptions: options,
                filteredGroupedOptions: null
            };
        }

        const searchLower = debouncedSearchTerm.toLowerCase();
        
        // 极速搜索：使用indexOf代替includes，更快
        const filtered = [];
        for (let i = 0; i < processedOptions.length; i++) {
            const option = processedOptions[i];
            // 姓名匹配 - 使用indexOf比includes更快
            if (option.searchableText.indexOf(searchLower) !== -1) {
                filtered.push(option);
                continue;
            }
            // 邮箱前缀匹配
            if (option.emailPrefix && option.emailPrefix.indexOf(searchLower) !== -1) {
                filtered.push(option);
            }
        }
        
        if (groupedOptions) {
            // 创建快速查找Set
            const filteredValueSet = new Set(filtered.map(f => f.value));
            const filteredGroups = [];
            
            for (let i = 0; i < groupedOptions.length; i++) {
                const group = groupedOptions[i];
                const groupOptions = [];
                
                for (let j = 0; j < group.options.length; j++) {
                    if (filteredValueSet.has(group.options[j].value)) {
                        groupOptions.push(group.options[j]);
                    }
                }
                
                if (groupOptions.length > 0) {
                    filteredGroups.push({
                        ...group,
                        options: groupOptions
                    });
                }
            }
            
            return {
                flatFilteredOptions: filtered,
                filteredGroupedOptions: filteredGroups,
            };
        }
        
        return {
            flatFilteredOptions: filtered,
            filteredGroupedOptions: null
        };
    }, [processedOptions, groupedOptions, debouncedSearchTerm]);

    const areAllFilteredSelected = useMemo(() => {
        if (flatFilteredOptions.length === 0) return false;
        return flatFilteredOptions.every(o => selectedValues.includes(o.value));
    }, [flatFilteredOptions, selectedValues]);

    const handleToggleAll = useCallback(() => {
        const allFilteredValues = flatFilteredOptions.map(o => o.value);
        if (areAllFilteredSelected) {
            // Deselect all filtered
            const filteredValuesSet = new Set(allFilteredValues);
            onSelectionChange(selectedValues.filter(v => !filteredValuesSet.has(v)));
        } else {
            // Select all filtered
            onSelectionChange([...new Set([...selectedValues, ...allFilteredValues])]);
        }
    }, [flatFilteredOptions, areAllFilteredSelected, selectedValues, onSelectionChange]);
    
    // 部门全选/取消全选
    const handleToggleDepartment = useCallback((departmentLabel: string) => {
        const currentGroup = filteredGroupedOptions?.find(g => g.label === departmentLabel);
        if (!currentGroup) return;
        
        const groupValues = currentGroup.options.map(o => o.value);
        const allGroupSelected = groupValues.every(v => selectedValues.includes(v));
        
        if (allGroupSelected) {
            // 取消选择该部门的所有人员
            const groupValuesSet = new Set(groupValues);
            onSelectionChange(selectedValues.filter(v => !groupValuesSet.has(v)));
        } else {
            // 选择该部门的所有人员
            onSelectionChange([...new Set([...selectedValues, ...groupValues])]);
        }
    }, [filteredGroupedOptions, selectedValues, onSelectionChange]);
    
    const renderOption = (option: Option) => {
        const isSelected = selectedValues.includes(option.value);
        return (
            <li key={option.value}>
                <label className={`group flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-all duration-200 ${
                    isSelected 
                        ? 'bg-[#6C63FF]/10 border border-[#6C63FF]/20 text-[#6C63FF] dark:text-[#A29DFF] font-medium shadow-sm' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#3a3a3a] hover:shadow-sm border border-transparent'
                }`}>
                    <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md border-2 transition-all duration-200 ${
                        isSelected 
                            ? 'bg-[#6C63FF] border-[#6C63FF] shadow-sm' 
                            : 'bg-white dark:bg-[#2d2d2d] border-gray-300 dark:border-gray-600 group-hover:border-[#6C63FF]/50'
                    }`}>
                        {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        )}
                    </div>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleOption(option.value)}
                        className="sr-only"
                    />
                    <span className="flex-grow leading-relaxed">{option.label}</span>
                    {isSelected && (
                        <div className="w-2 h-2 bg-[#6C63FF] rounded-full flex-shrink-0 animate-pulse"></div>
                    )}
                </label>
            </li>
        );
    };

    const isActive = selectedValues.length > 0;

    // 下拉菜单内容
    const dropdownContent = isOpen ? (
        <div 
            ref={dropdownContentRef}
            style={{
                position: 'fixed',
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                zIndex: 999999,
            }}
            className="bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#4a4a4a] rounded-xl shadow-2xl flex flex-col max-h-[70vh] min-h-[200px]"
        >
            {/* 搜索区域 */}
            <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-[#4a4a4a] bg-gray-50 dark:bg-[#232323] rounded-t-xl">
                <div className="relative">
                   <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                   <input
                     ref={searchInputRef}
                     type="text"
                     placeholder="搜索选项..."
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg pl-10 pr-4 py-2.5 w-full text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF] focus:border-[#6C63FF] transition-all"
                   />
                </div>
            </div>
            
            {/* 全选/取消选择按钮 */}
            {flatFilteredOptions.length > 0 && (
                <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-[#4a4a4a] bg-gray-50 dark:bg-[#232323]">
                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={handleToggleAll}
                            className="px-4 py-2 text-sm font-medium text-white bg-[#6C63FF] rounded-lg hover:bg-[#5a52d9] focus:outline-none focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-2 transition-all duration-200 shadow-sm"
                        >
                            全部选择
                        </button>
                        <button
                            onClick={() => {
                                console.log('❌ MultiSelectDropdown 取消选择被点击:', placeholder);
                                onSelectionChange([]);
                            }}
                            disabled={selectedValues.length === 0}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            取消选择
                        </button>
                    </div>
                </div>
            )}
            
            {/* 选项列表区域 */}
            <div className="flex-grow overflow-hidden flex">
                {/* 分组模式：左右栏布局 */}
                {filteredGroupedOptions ? (
                    <>
                        {/* 左侧部门列表 */}
                        <div className="w-1/3 border-r border-gray-200 dark:border-[#4a4a4a] overflow-y-auto">
                            <ul className="p-2">
                                {/* 全部选项 */}
                                <li key="__all__">
                                    <button
                                        onClick={() => setSelectedDepartment('__all__')}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                                            selectedDepartment === '__all__'
                                                ? 'bg-[#6C63FF] text-white shadow-sm'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3a3a3a]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">全部</span>
                                            {selectedValues.length > 0 && (
                                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                    selectedDepartment === '__all__'
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-[#6C63FF]/10 text-[#6C63FF]'
                                                }`}>
                                                    {selectedValues.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs mt-1 opacity-75">
                                            {flatFilteredOptions.length}人
                                        </div>
                                    </button>
                                </li>
                                
                                {filteredGroupedOptions.map(group => {
                                    const groupSelectedCount = group.options.filter(opt => selectedValues.includes(opt.value)).length;
                                    const allGroupSelected = group.options.every(opt => selectedValues.includes(opt.value));
                                    
                                    return (
                                        <li key={group.label}>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setSelectedDepartment(group.label)}
                                                    className={`flex-1 text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                                                        selectedDepartment === group.label
                                                            ? 'bg-[#6C63FF] text-white shadow-sm'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3a3a3a]'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium">{group.label}</span>
                                                        {groupSelectedCount > 0 && (
                                                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                                selectedDepartment === group.label
                                                                    ? 'bg-white/20 text-white'
                                                                    : 'bg-[#6C63FF]/10 text-[#6C63FF]'
                                                            }`}>
                                                                {groupSelectedCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs mt-1 opacity-75">
                                                        {group.options.length}人
                                                    </div>
                                                </button>
                                                
                                                {/* 部门全选按钮 */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleDepartment(group.label);
                                                    }}
                                                    className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-xs transition-all duration-200 ${
                                                        allGroupSelected
                                                            ? 'bg-[#6C63FF] text-white hover:bg-[#5a52d9]'
                                                            : 'bg-gray-100 dark:bg-[#3a3a3a] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#4a4a4a]'
                                                    }`}
                                                    title={allGroupSelected ? '取消全选' : '全选'}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        
                        {/* 右侧员工列表 */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {selectedDepartment === '__all__' ? (
                                <ul className="space-y-1">
                                    {flatFilteredOptions.map(renderOption)}
                                </ul>
                            ) : selectedDepartment && (() => {
                                const currentGroup = filteredGroupedOptions.find(g => g.label === selectedDepartment);
                                return currentGroup ? (
                                    <ul className="space-y-1">
                                        {currentGroup.options.map(renderOption)}
                                    </ul>
                                ) : null;
                            })()}
                        </div>
                    </>
                ) : (
                    /* 非分组模式：原来的单列布局 */
                    <ul className="flex-1 overflow-y-auto p-2 space-y-1">
                        {flatFilteredOptions.map(renderOption)}
                        
                        {flatFilteredOptions.length === 0 && (
                            <li className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                                <div className="w-12 h-12 bg-gray-100 dark:bg-[#3a3a3a] rounded-full flex items-center justify-center mb-3">
                                    <IconSearch className="w-6 h-6" />
                                </div>
                                <p className="text-sm font-medium">无匹配选项</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">尝试调整搜索条件</p>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`group relative border rounded-lg px-3 py-2.5 w-full min-w-[120px] text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                    isActive
                    ? 'bg-[#6C63FF]/10 border-[#6C63FF]/40 text-[#6C63FF] dark:text-[#A29DFF] shadow-[#6C63FF]/20'
                    : 'bg-white dark:bg-[#2d2d2d] border-gray-300 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#3a3a3a] hover:border-gray-400 dark:hover:border-[#5a5a5a]'
                } ${isOpen ? 'ring-2 ring-[#6C63FF] ring-offset-2 shadow-lg' : ''}`}
            >
                <span className="font-medium truncate pr-2">{displayLabel}</span>
                <div className="flex items-center space-x-2 flex-shrink-0">
                    {isActive && (
                        <div className="w-2 h-2 bg-[#6C63FF] rounded-full animate-pulse"></div>
                    )}
                    <IconChevronDown className={`w-4 h-4 transition-all duration-300 ${
                        isOpen ? 'rotate-180 text-[#6C63FF]' : 'group-hover:text-[#6C63FF]'
                    }`} />
                </div>
                
                {/* 视觉提示：展开状态指示器 */}
                {isOpen && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#6C63FF]"></div>
                )}
            </button>
            
            {/* 使用 Portal 渲染到 document.body，避免 z-index 冲突和布局问题 */}
            {dropdownContent && ReactDOM.createPortal(dropdownContent, document.body)}
        </div>
    );
};