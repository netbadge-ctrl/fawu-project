import { pinyin } from 'pinyin-pro';
import { Comment, User } from './types';

// 防抖函数
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// 缓存拼音转换结果以提升性能
const pinyinCache = new Map<string, { full: string; initials: string; continuous: string; initialsContinuous: string }>();
const MAX_CACHE_SIZE = 1000;

// 拼音库预热 - 使用 requestIdleCallback 避免阻塞
if (typeof window !== 'undefined') {
    const warmUp = () => {
        try {
            pinyin('测试', { toneType: 'none' });
            pinyin('用户', { pattern: 'initial' });
        } catch { /* ignore warmup errors */ }
    };
    
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(warmUp, { timeout: 1000 });
    } else {
        setTimeout(warmUp, 100);
    }
}

export const fuzzySearch = (searchText: string, targetText: string): boolean => {
    if (!searchText) return true;
    if (!targetText) return false;

    const search = searchText.toLowerCase().trim();
    const target = targetText.toLowerCase();

    // 1. Direct inclusion check (fastest) - 对中文直接匹配最有效
    if (target.includes(search)) {
        return true;
    }

    // 2. 检查是否包含中文字符
    const hasChinese = /[\u4e00-\u9fff]/.test(search);
    
    // 如果搜索词是纯中文，优先使用直接匹配和简单序列匹配
    if (hasChinese) {
        // 简单的字符序列匹配
        let searchIndex = 0;
        for (let i = 0; i < target.length; i++) {
            if (target[i] === search[searchIndex]) {
                searchIndex++;
            }
            if (searchIndex === search.length) {
                return true;
            }
        }
        
        // 对于中文搜索，如果长度较短，直接返回结果，避免拼音转换
        if (search.length <= 2) {
            return false;
        }
    }

    // 3. 拼音搜索（主要用于英文搜索词）
    if (!hasChinese || search.length > 2) {
        try {
            // 使用缓存避免重复的拼音转换
            let pinyinData = pinyinCache.get(targetText);
            if (!pinyinData) {
                const targetPinyin = pinyin(targetText, { toneType: 'none', nonZh: 'consecutive' }).toLowerCase();
                const targetPinyinInitials = pinyin(targetText, { pattern: 'initial', nonZh: 'consecutive' }).toLowerCase();
                
                pinyinData = {
                    full: targetPinyin,
                    initials: targetPinyinInitials,
                    continuous: targetPinyin.replace(/\s+/g, ''),
                    initialsContinuous: targetPinyinInitials.replace(/\s+/g, '')
                };
                
                // 限制缓存大小，避免内存泄漏
                if (pinyinCache.size > MAX_CACHE_SIZE) {
                    const firstKey = pinyinCache.keys().next().value;
                    pinyinCache.delete(firstKey);
                }
                pinyinCache.set(targetText, pinyinData);
            }

            // 快速检查拼音匹配
            if (pinyinData.full.includes(search) || 
                pinyinData.continuous.includes(search) ||
                pinyinData.initials.includes(search) ||
                pinyinData.initialsContinuous.includes(search)) {
                return true;
            }

            // 检查单词边界匹配（仅对较短的搜索词）
            if (search.length <= 3) {
                const pinyinWords = pinyinData.full.split(/\s+/);
                const initialWords = pinyinData.initials.split(/\s+/);
                
                for (let i = 0; i < pinyinWords.length; i++) {
                    if (pinyinWords[i].startsWith(search) || initialWords[i]?.startsWith(search)) {
                        return true;
                    }
                }
            }
        } catch {
            // 拼音转换失败时的降级处理 - 静默失败
        }
    }
    
    // 4. 最后的字符序列匹配（作为后备）
    let searchIndex = 0;
    for (let i = 0; i < target.length; i++) {
        if (target[i] === search[searchIndex]) {
            searchIndex++;
        }
        if (searchIndex === search.length) {
            return true;
        }
    }

    return false;
};

export const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const formatDateOnly = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

// 从用户输入/粘贴的文本中提取首个 http(s) 链接。
// - 如果输入本身就是 http(s) URL，返回去除首尾空白后的第一段。
// - 如果输入是《中文描述 + URL》混合文本，提取中间的 URL。
// - 如果仅含裸域名（如 example.com/path），自动补上 https:// 前缀。
// - 提取不到任何合法路径时返回 null。
export const extractUrl = (input: string): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 常见包裹符去除（中英文括号、引号等）
  const peel = (s: string) => s.replace(/^[\s\u3000<>"'\u300a\u300b\u3010\u3011\u300c\u300d\(\)\[\]]+|[\s\u3000<>"'\u300a\u300b\u3010\u3011\u300c\u300d\)\]\.,;:\u3002\uff0c\uff1b\uff1a]+$/g, '');

  // 从文本中搜首个 http/https URL
  const m = trimmed.match(/https?:\/\/[^\s\u3000<>"'\u300a\u300b\u3010\u3011\u300c\u300d]+/i);
  if (m) return peel(m[0]);

  // 裸域名启发式（包含点，且不含中文/空白）→ 补 https://
  if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/.*)?$/.test(trimmed)) {
    return 'https://' + trimmed;
  }

  return null;
};

// 面向展示场景的安全 href：如果原始值不是有效 http(s) 链接，尝试提取；
// 提取不到返回 '#'，避免被浏览器拼接为当前站点的相对路径。
export const safeHref = (raw: string | null | undefined): string => {
  if (!raw) return '#';
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return extractUrl(t) || '#';
};

export const renderCommentTextAsHtml = (comment: Comment, allUsers: User[]): string => {
    let text = comment.text;
    // Basic HTML escaping
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (!comment.mentions || comment.mentions.length === 0) {
        return text.replace(/\n/g, '<br />');
    }

    const mentionedUsers = comment.mentions
        .map(id => allUsers.find(u => u.id === id))
        .filter((u): u is User => !!u);

    mentionedUsers.forEach(user => {
        // Escape user name for regex
        const escapedName = user.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`@${escapedName}`, 'g');
        text = text.replace(regex, `<span class="font-semibold text-indigo-400">@${user.name}</span>`);
    });

    return text.replace(/\n/g, '<br />');
};