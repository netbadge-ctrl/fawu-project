import React, { useState } from 'react';
import { Document, User } from '../types';
import { IconX, IconPlus, IconTrash } from './Icons';

interface DocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  onAddDocument: (name: string, url: string) => void;
  onDeleteDocument: (id: string) => void;
  projectName: string;
  allUsers: User[];
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
  isOpen,
  onClose,
  documents,
  onAddDocument,
  onDeleteDocument,
  projectName,
  allUsers
}) => {
  const [newDocName, setNewDocName] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (newDocName.trim() && newDocUrl.trim()) {
      onAddDocument(newDocName.trim(), newDocUrl.trim());
      setNewDocName('');
      setNewDocUrl('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setNewDocName('');
      setNewDocUrl('');
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70" 
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-white dark:bg-[#232323] border border-gray-200 dark:border-[#363636] rounded-xl w-full max-w-2xl text-gray-900 dark:text-white shadow-lg flex flex-col max-h-[80vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#363636]">
          <h2 className="text-xl font-semibold">{projectName} 项目文档</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2d2d2d] hover:text-gray-900 dark:hover:text-white"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* 文档列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {documents.length === 0 && !isAdding ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p>暂无文档</p>
              <p className="text-sm mt-2">点击下方按钮添加第一个文档</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const creator = allUsers.find(u => u.id === doc.createdBy);
                const creatorName = creator ? creator.name : '未知';
                
                return (
                  <div 
                    key={doc.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#2d2d2d] rounded-lg hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors group"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      {/* 文档名称 */}
                      <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                        {doc.name}
                      </span>
                      
                      {/* 分隔符 */}
                      <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">-</span>
                      
                      {/* 文档链接 */}
                      <a 
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.url}
                      </a>
                      
                      {/* 编辑人 */}
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                        由 {creatorName} 添加
                      </span>
                    </div>
                    
                    {/* 删除按钮 */}
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="ml-3 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {/* 添加文档表单 */}
              {isAdding && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg space-y-3">
                  <input
                    type="text"
                    placeholder="文档名称"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded-md bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <input
                    type="url"
                    placeholder="文档链接（如：https://...）"
                    value={newDocUrl}
                    onChange={(e) => setNewDocUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded-md bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAdd}
                      disabled={!newDocName.trim() || !newDocUrl.trim()}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      确定
                    </button>
                    <button
                      onClick={() => {
                        setNewDocName('');
                        setNewDocUrl('');
                        setIsAdding(false);
                      }}
                      className="px-4 py-2 bg-gray-200 dark:bg-[#3a3a3a] text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-[#4a4a4a]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-[#363636]">
          <button
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconPlus className="w-4 h-4" />
            添加文档
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
