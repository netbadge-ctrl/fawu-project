import React, { useRef, useEffect, useState, useCallback } from 'react';

interface RichTextInputProps {
    html: string;
    onChange: (newHtml: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    className?: string;
    minRows?: number;
    maxRows?: number;
}

export const RichTextInput: React.FC<RichTextInputProps> = ({ 
    html, 
    onChange, 
    onBlur,
    placeholder, 
    className = '', 
    minRows = 3,
    maxRows = 15 
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const [isBoldActive, setIsBoldActive] = useState(false);
    const [isRedActive, setIsRedActive] = useState(false);
    const isInitializedRef = useRef(false);

    // 自动调整高度
    const adjustHeight = useCallback(() => {
        if (!contentRef.current) return;

        const element = contentRef.current;
        const lineHeight = 21;
        const minHeight = lineHeight * minRows;
        const maxHeight = lineHeight * maxRows;

        element.style.height = 'auto';
        const scrollHeight = element.scrollHeight;
        
        const finalHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
        element.style.height = `${finalHeight}px`;
        // 当内容超过最大高度时显示滚动条
        element.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
        // 禁止横向滚动
        element.style.overflowX = 'hidden';
    }, [minRows, maxRows]);

    // 初始化内容
    useEffect(() => {
        if (contentRef.current && !isInitializedRef.current) {
            contentRef.current.innerHTML = html || '';
            isInitializedRef.current = true;
            adjustHeight();
        }
    }, [html, adjustHeight]);

    // 更新按钮状态
    const updateButtonStates = useCallback(() => {
        if (!contentRef.current) return;
        
        try {
            const boldState = document.queryCommandState('bold');
            const currentColor = document.queryCommandValue('foreColor');
            const redState = currentColor === 'rgb(239, 68, 68)' || currentColor === '#ef4444' || currentColor === 'red';
            
            setIsBoldActive(boldState);
            setIsRedActive(redState);
        } catch (e) {
            // 忽略错误
        }
    }, []);

    // 直接处理输入
    const handleInput = useCallback(() => {
        if (!contentRef.current) return;
        
        const newHtml = contentRef.current.innerHTML;
        adjustHeight();
        onChange(newHtml);
        updateButtonStates();
    }, [onChange, adjustHeight, updateButtonStates]);

    // 处理按键
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setTimeout(() => adjustHeight(), 0);
        }
    }, [adjustHeight]);

    // 处理命令
    const handleCommand = (e: React.MouseEvent, command: string) => {
        e.preventDefault();
        
        if (!contentRef.current) return;
        
        contentRef.current.focus();
        
        if (command === 'bold') {
            document.execCommand('bold', false);
        } else if (command === 'foreColor') {
            const currentColor = document.queryCommandValue('foreColor');
            const isCurrentlyRed = currentColor === 'rgb(239, 68, 68)' || currentColor === '#ef4444' || currentColor === 'red';
            
            if (isCurrentlyRed) {
                // 检测当前是否为深色模式
                const isDarkMode = document.documentElement.classList.contains('dark') || 
                                 window.matchMedia('(prefers-color-scheme: dark)').matches;
                
                // 根据主题模式设置合适的默认颜色
                const defaultColor = isDarkMode ? '#f3f4f6' : '#111827'; // 深色模式用浅灰色，浅色模式用深灰色
                document.execCommand('foreColor', false, defaultColor);
            } else {
                document.execCommand('foreColor', false, '#ef4444');
            }
        }
        
        // 清除可能被浏览器添加的背景色
        setTimeout(() => {
            if (contentRef.current) {
                // 移除所有 span 元素的 background 和 backgroundColor 样式
                const spans = contentRef.current.querySelectorAll('span[style*="background"], font[style*="background"]');
                spans.forEach((span) => {
                    const element = span as HTMLElement;
                    if (element.style.background) element.style.background = '';
                    if (element.style.backgroundColor) element.style.backgroundColor = '';
                });
            }
            updateButtonStates();
            handleInput();
        }, 0);
    };

    // 处理焦点
    const handleFocus = useCallback(() => {
        updateButtonStates();
    }, [updateButtonStates]);

    // 处理失焦 - 添加延迟避免过于敏感
    const handleBlur = useCallback((e: React.FocusEvent) => {
        const currentTarget = e.currentTarget;
        const relatedTarget = e.relatedTarget as HTMLElement;
        
        // 如果焦点移动到工具栏按钮，不触发失焦
        if (relatedTarget && (
            currentTarget.contains(relatedTarget) || 
            relatedTarget.closest('.rich-text-input')
        )) {
            return;
        }
        
        // 延迟触发失焦事件，给用户时间在编辑器内移动
        setTimeout(() => {
            // 再次检查焦点是否还在编辑器内
            if (document.activeElement?.closest('.rich-text-input')) {
                return;
            }
            onBlur?.();
        }, 200);
    }, [onBlur]);

    // 处理选择变化
    useEffect(() => {
        const handleSelectionChange = () => {
            if (document.activeElement === contentRef.current) {
                updateButtonStates();
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [updateButtonStates]);

    return (
        <div className="rich-text-input">
            <div className="flex gap-1 mb-2 p-1.5 bg-gray-50 dark:bg-gray-800 rounded border">
                <button
                    type="button"
                    onMouseDown={(e) => handleCommand(e, 'bold')}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        isBoldActive 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                >
                    粗
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => handleCommand(e, 'foreColor')}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        isRedActive 
                            ? 'bg-red-500 text-white' 
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                >
                    红
                </button>
            </div>

            <div
                ref={contentRef}
                contentEditable
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={`
                    w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    resize-none text-sm
                    ${className}
                `}
                style={{
                    minHeight: `${21 * minRows}px`,
                    lineHeight: '21px',
                    wordWrap: 'break-word',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    overflowX: 'hidden',
                    maxWidth: '100%',
                    whiteSpace: 'pre-wrap'
                }}
                data-placeholder={placeholder}
            />

            <style>{`
                .rich-text-input [contenteditable]:empty:before {
                    content: attr(data-placeholder);
                    color: #9ca3af;
                    pointer-events: none;
                }
                .rich-text-input [contenteditable]:focus:before {
                    display: none;
                }
                .rich-text-input [contenteditable] {
                    word-wrap: break-word;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                    white-space: pre-wrap;
                    max-width: 100%;
                    overflow-x: hidden !important;
                }
                .rich-text-input [contenteditable] * {
                    word-wrap: break-word;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                    max-width: 100%;
                }
            `}</style>
        </div>
    );
};