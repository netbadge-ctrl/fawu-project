import React, { useState, useMemo, useRef, useEffect } from 'react';
import { OKR, KeyResult, OkrSet } from '../types';
import { IconTrash, IconPlus, IconSearch, IconChevronDown } from './Icons';
import { fuzzySearch } from '../utils';

interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  isTextarea?: boolean;
}

const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, placeholder, isTextarea = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value);

  const handleSave = () => {
    if (text.trim() !== value) {
      onSave(text.trim());
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        if (isTextarea) {
            // 对于textarea，支持换行：Shift+Enter换行，Enter保存
            if (!e.shiftKey) {
                e.preventDefault();
                handleSave();
            }
            // Shift+Enter允许换行（默认行为）
        } else {
            // 对于普通input，Enter直接保存
            handleSave();
        }
    } else if (e.key === 'Escape') {
        setText(value);
        setIsEditing(false);
    }
  }

  if (isEditing) {
    const commonProps = {
      value: text,
      onChange: (e: any) => setText(e.target.value),
      onBlur: handleSave,
      onKeyDown: handleKeyDown,
      autoFocus: true,
      className: "w-full bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-md px-2 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]",
    };
    return isTextarea ? <textarea {...commonProps} rows={2} /> : <input type="text" {...commonProps} />;
  }

  return (
    <div onClick={() => setIsEditing(true)} className="w-full cursor-pointer p-1.5 -m-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#3a3a3a] min-h-[30px] whitespace-pre-wrap">
      {value || <span className="text-gray-500">{placeholder}</span>}
    </div>
  );
};


interface OKRPageProps {
  okrSets: OkrSet[];
  currentPeriodId: string | null;
  onPeriodChange: (periodId: string) => void;
  onUpdateOkrs: (okrs: OKR[]) => void;
  onCreateNewPeriod: () => void;
}

export const OKRPage: React.FC<OKRPageProps> = ({ okrSets, currentPeriodId, onPeriodChange, onUpdateOkrs, onCreateNewPeriod }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);
  const periodSelectorRef = useRef<HTMLDivElement>(null);

  const currentOkrs = useMemo(() => {
    if (!currentPeriodId) return [];
    return okrSets.find(s => s.periodId === currentPeriodId)?.okrs || [];
  }, [okrSets, currentPeriodId]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (periodSelectorRef.current && !periodSelectorRef.current.contains(event.target as Node)) {
            setIsPeriodSelectorOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCommitChanges = (newOkrs: OKR[]) => {
      onUpdateOkrs(newOkrs);
  };

  const handleAddOkr = () => {
    // 计算新OKR的序号
    const okrCount = currentOkrs.length;
    const okrNumber = okrCount + 1;
    
    // 使用标准格式: o1, o2, ...
    const okrId = `o${okrNumber}`;
    
    const newOkr: OKR = {
      id: okrId,
      objective: '新的目标',
      keyResults: [{ id: `${okrId}::kr1`, description: '新的关键成果' }],
    };
    handleCommitChanges([...currentOkrs, newOkr]);
  };

  const handleDeleteOkr = (okrIdToDelete: string) => {
    const okrToDelete = currentOkrs.find(o => o.id === okrIdToDelete);
    if (!okrToDelete) return;
    
    if (window.confirm(`您确定要删除目标 "${okrToDelete.objective}" 吗？此操作无法撤销。`)) {
        const newOkrs = currentOkrs.filter(okr => okr.id !== okrIdToDelete);
        handleCommitChanges(newOkrs);
    }
  };

  const handleAddKr = (okrId: string) => {
    // 计算新KR的序号
    const okr = currentOkrs.find(o => o.id === okrId);
    const krCount = (okr?.keyResults || []).length;
    const krNumber = krCount + 1;
    
    // 使用复合ID格式: okrId::krN
    const newKr: KeyResult = { 
      id: `${okrId.toLowerCase()}::kr${krNumber}`, 
      description: '新的关键成果' 
    };
    
    const newOkrs = currentOkrs.map(okr => {
        if(okr.id === okrId) {
            return {...okr, keyResults: [...okr.keyResults, newKr]}
        }
        return okr;
    });
    handleCommitChanges(newOkrs);
  };

  const handleDeleteKr = (okrId: string, krId: string) => {
    const okr = currentOkrs.find(o => o.id === okrId);
    const kr = okr?.keyResults.find(k => k.id === krId);
    if (!kr) return;

    if (window.confirm(`您确定要删除关键成果 "${kr.description}" 吗？`)) {
        const newOkrs = currentOkrs.map(o => {
            if (o.id === okrId) {
                return { ...o, keyResults: o.keyResults.filter(k => k.id !== krId) }
            }
            return o;
        })
        handleCommitChanges(newOkrs);
    }
  };

  const handleUpdateKr = (okrId: string, krId: string, updatedKr: Partial<KeyResult>) => {
    const newOkrs = currentOkrs.map(okr => {
        if(okr.id === okrId) {
            return {
                ...okr,
                keyResults: okr.keyResults.map(kr => kr.id === krId ? {...kr, ...updatedKr} : kr)
            }
        }
        return okr;
    });
    handleCommitChanges(newOkrs);
  };
  
  const handleUpdateObjective = (okrId: string, objective: string) => {
     const newOkrs = currentOkrs.map(okr => okr.id === okrId ? {...okr, objective} : okr);
     handleCommitChanges(newOkrs);
  };

  const filteredOkrs = useMemo(() => {
    if (!searchTerm) {
        return currentOkrs;
    }
    return currentOkrs.filter(okr => 
        fuzzySearch(searchTerm, okr.objective) ||
        okr.keyResults.some(kr => fuzzySearch(searchTerm, kr.description))
    );
  }, [currentOkrs, searchTerm]);
  
  const currentPeriodName = useMemo(() => {
      return okrSets.find(s => s.periodId === currentPeriodId)?.periodName || '选择周期';
  }, [okrSets, currentPeriodId]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                    <div ref={periodSelectorRef} className="relative">
                        <button
                            onClick={() => setIsPeriodSelectorOpen(p => !p)}
                            className="bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg pl-4 pr-10 py-2 text-lg font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6C63FF] appearance-none flex items-center gap-2"
                        >
                            {currentPeriodName}
                            <IconChevronDown className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${isPeriodSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isPeriodSelectorOpen && (
                            <div className="absolute top-full mt-2 w-full bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#4a4a4a] rounded-lg shadow-xl z-20">
                                <ul className="p-1 max-h-60 overflow-y-auto">
                                    {okrSets.map(set => (
                                        <li key={set.periodId}>
                                            <button 
                                                onClick={() => { onPeriodChange(set.periodId); setIsPeriodSelectorOpen(false); }} 
                                                className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-[#3a3a3a] ${currentPeriodId === set.periodId ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}
                                            >
                                                {set.periodName}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-grow min-w-[200px]">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                placeholder="搜索目标或关键成果..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] rounded-lg pl-10 pr-4 py-2 w-full text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
                            />
                        </div>
                         <button onClick={onCreateNewPeriod} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors">
                            <IconPlus className="w-4 h-4"/>
                            <span>创建新周期</span>
                        </button>
                        <button onClick={handleAddOkr} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#6C63FF] text-white rounded-lg font-semibold text-sm hover:bg-[#5a52d9] transition-colors">
                            <IconPlus className="w-4 h-4"/>
                            <span>添加OKR</span>
                        </button>
                    </div>
                </div>
                <div className="space-y-6">
                    {filteredOkrs.map((okr, index) => (
                        <div key={okr.id} className="bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl p-6">
                            <div className="flex justify-between items-start gap-4">
                               <div className="flex items-start gap-4 flex-grow">
                                  <span className="text-2xl font-bold text-gray-400 dark:text-gray-500 mt-1 select-none">O{index + 1}</span>
                                  <div className="flex-grow">
                                      <label className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold">目标 (Objective)</label>
                                      <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                                        <EditableField value={okr.objective} onSave={(val) => handleUpdateObjective(okr.id, val)} placeholder="输入目标" isTextarea={true}/>
                                      </div>
                                  </div>
                               </div>
                                <button onClick={() => handleDeleteOkr(okr.id)} className="p-2 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md flex-shrink-0" aria-label="删除OKR"><IconTrash className="w-5 h-5"/></button>
                            </div>
                            
                            <div className="mt-4 pl-12">
                                <label className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold">关键成果 (Key Results)</label>
                                <div className="space-y-3 mt-2">
                                    {okr.keyResults.map((kr, krIndex) => (
                                        <div key={kr.id} className="flex items-start gap-3">
                                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 w-20 flex-shrink-0 pt-2 select-none">O{index + 1}-KR{krIndex + 1}</span>
                                            <div className="flex-grow text-gray-700 dark:text-gray-300">
                                                <EditableField value={kr.description} onSave={(val) => handleUpdateKr(okr.id, kr.id, { description: val })} placeholder="输入关键成果" isTextarea={true} />
                                            </div>
                                            <button onClick={() => handleDeleteKr(okr.id, kr.id)} className="p-1 text-red-500/70 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md" aria-label="删除KR"><IconTrash className="w-4 h-4"/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => handleAddKr(okr.id)} className="flex items-center gap-2 text-sm text-[#6C63FF] hover:text-[#5a52d9] dark:hover:text-white font-semibold py-1 px-2 rounded-md hover:bg-[#6c63ff]/10 dark:hover:bg-[#6c63ff2a]">
                                        <IconPlus className="w-4 h-4" />
                                        添加关键成果
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                     {filteredOkrs.length === 0 && (
                        <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                            {searchTerm ? '没有匹配的OKR' : '当前周期暂无OKR'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </main>
  );
};