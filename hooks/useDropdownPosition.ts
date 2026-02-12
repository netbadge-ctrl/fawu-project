import { useState, useLayoutEffect, RefObject, CSSProperties } from 'react';

interface DropdownPositionOptions {
    triggerRef: RefObject<HTMLElement>;
    menuRef: RefObject<HTMLElement>;
    isOpen: boolean;
    gap?: number;
    align?: 'start' | 'end';
    preferredPosition?: 'bottom' | 'top';
}

export const useDropdownPosition = ({
    triggerRef,
    menuRef,
    isOpen,
    gap = 4,
    align = 'start',
    preferredPosition = 'bottom'
}: DropdownPositionOptions) => {
    const [style, setStyle] = useState<CSSProperties>({
        position: 'fixed',
        opacity: 0,
        pointerEvents: 'none',
    });

    useLayoutEffect(() => {
        if (!isOpen) {
            setStyle(s => ({ ...s, opacity: 0, pointerEvents: 'none' }));
            return;
        }
        
        const triggerEl = triggerRef.current;
        const menuEl = menuRef.current;
        if (!triggerEl || !menuEl) return;
        
        const calculatePosition = () => {
            const rect = triggerEl.getBoundingClientRect();
            const menuHeight = menuEl.offsetHeight || 300;
            const menuWidth = menuEl.offsetWidth || 288;
            
            let top: number, left: number;

            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            // 紧贴按钮显示：优先向下，紧贴按钮底部
            if (spaceBelow >= menuHeight + 4) {
                top = rect.bottom + 2; // 紧贴按钮底部，只留2px间距
            } else if (spaceAbove >= menuHeight + 4) {
                top = rect.top - menuHeight - 2; // 紧贴按钮顶部
            } else {
                // 空间不足时，仍然紧贴按钮底部显示
                top = rect.bottom + 2;
            }

            // 完全左对齐到按钮
            left = rect.left;
            
            // 只在必要时调整边界
            const rightOverflow = left + menuWidth - window.innerWidth;
            if (rightOverflow > 0) {
                left = left - rightOverflow - 8; // 向左调整
            }
            
            // 确保不超出左边界
            if (left < 8) {
                left = 8;
            }

            setStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: '288px',
                zIndex: 9999,
                opacity: 1,
                transition: 'opacity 150ms ease-in-out',
                pointerEvents: 'auto',
            });
        };

        calculatePosition(); // Initial calculation
        
        // Use a single RAF to recalculate on scroll/resize for performance
        let frameId: number;
        const onUpdate = () => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(calculatePosition);
        };
        
        window.addEventListener('scroll', onUpdate, true);
        window.addEventListener('resize', onUpdate);

        return () => {
            window.removeEventListener('scroll', onUpdate, true);
            window.removeEventListener('resize', onUpdate);
            cancelAnimationFrame(frameId);
        };
    }, [isOpen, triggerRef, menuRef, gap, align, preferredPosition]);

    return style;
};
