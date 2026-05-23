import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { LoadingSpinner } from './LoadingSpinner';
import { IconEdit2, IconCheck } from './Icons';

interface ProjectWeeklySummary {
  projectId: string;
  projectName: string;
  weeklyUpdate: string;
  status: string;
  priority: string;
  productManagers: string[];
  memberAlerts?: string[];
  scheduleChanges?: string[];
  delayRisks?: string[];
}

interface KrWeeklySummary {
  krId: string;
  krDesc: string;
  projectSummaries: ProjectWeeklySummary[];
}

interface OkrWeeklySummary {
  okrId: string;
  objective: string;
  krSummaries: KrWeeklySummary[];
}

interface WeeklyReportContent {
  okrSummaries: OkrWeeklySummary[];
}

interface WeeklyReport {
  id: string;
  weekYear: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: string;
  content: WeeklyReportContent;
  summary: string;
  createdAt: string;
  updatedAt: string;
  generatedBy: string;
}

// 历史版本（列表接口不返 content，详情接口返完整 content）
interface WeeklyReportVersion {
  id: string;
  reportId: string;
  weekYear: number;
  weekNumber: number;
  versionNo: number;
  content?: WeeklyReportContent;
  summary: string;
  generatedBy: string;
  archivedAt: string;
}

// ---- 视觉辅助 ----
const pad2 = (n: number) => String(n).padStart(2, '0');
const shortDate = (s: string) => (s || '').slice(5); // MM-DD

const reportStatusMeta = (s: string) => {
  if (s === 'finalized') return { label: '已归档', cls: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10', dot: 'bg-emerald-500' };
  if (s === 'editing') return { label: '编辑中', cls: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10', dot: 'bg-amber-500' };
  return { label: '已生成', cls: 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/10', dot: 'bg-sky-500' };
};

const projStatusCls = (s: string) => {
  if (s === '已完成') return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10';
  if (s === '进行中') return 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/10';
  if (s === '已暂停' || s === '已取消') return 'text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-500/10';
  return 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-500/10';
};

const projPriorityCls = (p: string) => {
  if (p === '高' || p === 'P0' || p === '临时重要需求')
    return 'text-rose-600 border-rose-200 dark:text-rose-400 dark:border-rose-500/30';
  if (p === '中' || p === 'P1' || p === '部门OKR' || p === '个人OKR')
    return 'text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-500/30';
  return 'text-zinc-500 border-zinc-200 dark:text-zinc-400 dark:border-zinc-600/40';
};

// 绝对时间："YYYY-MM-DD HH:mm"
// 北京时间格式化（UTC+8）
const formatDateTime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  // 转换为北京时间 (UTC+8)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const bj = new Date(utc + 8 * 3600000);
  const y = bj.getFullYear();
  const m = pad2(bj.getMonth() + 1);
  const day = pad2(bj.getDate());
  const h = pad2(bj.getHours());
  const min = pad2(bj.getMinutes());
  return `${y}-${m}-${day} ${h}:${min}`;
};

// 相对时间（基于北京时间）："2 小时前" / "3 天前"
const timeAgo = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  // 当前北京时间
  const nowUtc = Date.now() + (new Date().getTimezoneOffset() * 60000) + 8 * 3600000;
  const bjTime = d.getTime() + (d.getTimezoneOffset() * 60000) + 8 * 3600000;
  const diff = (nowUtc - bjTime) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatDateTime(iso).slice(0, 10);
};

const Kicker: React.FC<{ en: string; zh?: string }> = ({ en, zh }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
      {en}
    </span>
    {zh && (
      <>
        <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{zh}</span>
      </>
    )}
  </div>
);

const MainSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-8">
    <div className="space-y-3">
      <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
      <div className="h-8 w-96 rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
      <div className="h-3 w-48 rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
    </div>
    <div className="h-px bg-zinc-200 dark:bg-[#363636]" />
    <div className="space-y-3">
      <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
      <div className="h-4 w-[92%] rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
      <div className="h-4 w-[80%] rounded bg-zinc-200 dark:bg-[#2a2a2a]" />
    </div>
  </div>
);

const WeeklyReportView: React.FC = () => {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  // 历史版本列表 & 当前查看的历史版本（非空时只读预览）
  const [versions, setVersions] = useState<WeeklyReportVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<WeeklyReportVersion | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const versionsMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.fetchWeeklyReports();
      setReports(data);
      if (data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
      }
    } catch (err) {
      setError('获取周报列表失败');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedReport]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // 切换周报 tab 时拉历史版本 & 退出历史预览
  useEffect(() => {
    if (!selectedReport?.id) {
      setVersions([]);
      setViewingVersion(null);
      setVersionsOpen(false);
      return;
    }
    setViewingVersion(null);
    setVersionsOpen(false);
    api
      .fetchWeeklyReportVersions(selectedReport.id)
      .then((data: any) => setVersions(Array.isArray(data) ? data : []))
      .catch(() => setVersions([]));
  }, [selectedReport?.id]);

  // 点击项外关闭版本下拉
  useEffect(() => {
    if (!versionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!versionsMenuRef.current) return;
      if (!versionsMenuRef.current.contains(e.target as Node)) {
        setVersionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [versionsOpen]);

  const handleGenerate = async () => {
    if (isGenerating || isRegenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const report = await api.generateWeeklyReport();
      setSelectedReport(report);
      await fetchReports();
    } catch (err) {
      setError('生成周报失败');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedReport) return;
    if (isGenerating || isRegenerating) return;
    // v4.3：去除 window.confirm 拦截——清单进入后台，用户可继续操作其它页面
    setIsRegenerating(true);
    setError(null);
    try {
      const report = await api.regenerateWeeklyReport(selectedReport.id);
      // 后端返回的 archivedVersion 只是归档摘要，这里不处理，再拉一次列表以保持统一
      const refreshed: WeeklyReport = {
        ...selectedReport,
        ...report,
        id: selectedReport.id,
      };
      setSelectedReport(refreshed);
      const list = await api.fetchWeeklyReportVersions(selectedReport.id);
      setVersions(Array.isArray(list) ? list : []);
      await fetchReports();
    } catch (err) {
      setError('重新生成失败');
      console.error(err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleOpenVersion = async (versionId: string) => {
    try {
      const v = await api.fetchWeeklyReportVersion(versionId);
      setViewingVersion(v);
      setVersionsOpen(false);
      setIsEditing(false);
    } catch (err) {
      setError('加载历史版本失败');
      console.error(err);
    }
  };

  const handleUpdateSummary = async () => {
    if (!selectedReport) return;
    try {
      const updated = await api.updateWeeklyReport(selectedReport.id, {
        summary: editSummary,
        status: 'editing',
      });
      setSelectedReport(updated);
      setIsEditing(false);
      await fetchReports();
    } catch (err) {
      setError('更新周报失败');
      console.error(err);
    }
  };

  const getCurrentWeekInfo = () => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      week: getWeekNumber(now),
    };
  };

  const getWeekNumber = (date: Date) => {
    // 按本地时间计算 ISO 周号：走 UTC 会导致北京时区周一 00:00~08:00 与后端（按服务器本地时区 ISOWeek）不一致，
    // 出现"已生成本周周报但前端仍显示上一周"的边缘误判。
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
  };

  const currentWeek = getCurrentWeekInfo();
  const hasCurrentWeekReport = reports.some(
    r => r.weekYear === currentWeek.year && r.weekNumber === currentWeek.week
  );

  const stripHtml = (html: string) => {
    if (!html) return '';
    return html
      .replace(/<p>/g, '')
      .replace(/<\/p>/g, '\n')
      .replace(/<strong>/g, '')
      .replace(/<\/strong>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      // 兜底：清除富文本编辑器产生的其它标签（<ul>/<li>/<h3>/<span> 等）
      .replace(/<[^>]+>/g, '')
      .trim();
  };

  // 按时间倒序排序的周报 tabs
  const sortedReports = [...reports].sort((a, b) => {
    if (a.weekYear !== b.weekYear) return b.weekYear - a.weekYear;
    return b.weekNumber - a.weekNumber;
  });

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 dark:bg-[#181818] overflow-hidden">
      {/* Top Chrome */}
      <header className="bg-white dark:bg-[#222] border-b border-zinc-200 dark:border-[#333]">
        {/* Row 1: Title + Generate */}
        <div className="flex items-center justify-between gap-6 px-8 pt-5 pb-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-none">
              周报
            </h1>
            <span className="hidden sm:inline-block text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
              Weekly&nbsp;Report
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-baseline gap-2 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                This&nbsp;Week
              </span>
              <span className="font-mono text-zinc-900 dark:text-white tracking-tight">
                W{pad2(currentWeek.week)} / {currentWeek.year}
              </span>
            </div>
            <button
              onClick={hasCurrentWeekReport ? handleRegenerate : handleGenerate}
              disabled={!!viewingVersion}
              title={
                viewingVersion
                  ? '正在预览历史版本，请先返回当前版本'
                  : (isGenerating || isRegenerating)
                  ? '后台生成中，可继续操作其它页面'
                  : hasCurrentWeekReport
                  ? '重新生成，当前内容归档为历史版本'
                  : '生成本周周报'
              }
              className={`inline-flex items-center gap-2 h-9 px-4 rounded-md text-[13px] font-medium transition-all duration-200 active:translate-y-[1px] ${
                viewingVersion
                  ? 'bg-zinc-100 dark:bg-[#2a2a2a] text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-[#363636]'
                  : hasCurrentWeekReport
                  ? 'border border-zinc-200 dark:border-[#363636] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-[#222] hover:border-[#6C63FF] hover:text-[#6C63FF]'
                  : 'bg-[#6C63FF] text-white hover:bg-[#5a52d5] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14)]'
              }`}
            >
              {(isGenerating || isRegenerating) && <LoadingSpinner size="sm" />}
              {hasCurrentWeekReport
                ? isRegenerating
                  ? '重新生成中…'
                  : '重新生成'
                : isGenerating
                ? '生成中…'
                : '生成本周周报'}
            </button>
          </div>
        </div>

        {/* Row 2: Week Tabs */}
        {sortedReports.length > 0 && (
          <div
            ref={tabsRef}
            className="flex items-stretch gap-1 px-6 overflow-x-auto border-t border-zinc-100 dark:border-[#2a2a2a] [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {sortedReports.map((r) => {
              const active = selectedReport?.id === r.id;
              const meta = reportStatusMeta(r.status);
              return (
                <button
                  key={r.id}
                  onClick={() => { setSelectedReport(r); setIsEditing(false); }}
                  className={`relative shrink-0 inline-flex items-center gap-2 h-10 px-3 text-[12.5px] transition-all duration-200 ${
                    active
                      ? 'text-[#6C63FF] dark:text-[#B4AEFF]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <span className={`font-mono tracking-tight ${active ? 'font-semibold' : ''}`}>
                    W{pad2(r.weekNumber)}
                  </span>
                  <span className="font-mono text-zinc-400 dark:text-zinc-500">·</span>
                  <span className="font-mono text-zinc-400 dark:text-zinc-500">
                    {shortDate(r.startDate)}
                  </span>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {active && (
                    <span className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full bg-[#6C63FF]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-8 py-8 lg:px-12 xl:px-16 2xl:px-24 xl:py-10">
          {error && (
            <div className="mb-6 rounded-md border border-rose-200/70 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-500/5 px-4 py-2.5 text-[13px] text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {isLoading && !selectedReport ? (
            <MainSkeleton />
          ) : selectedReport ? (
            <div>
              {/* Historical Version Banner */}
              {viewingVersion && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/5 px-4 py-2.5">
                  <div className="flex items-baseline gap-3 text-[12.5px]">
                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-500/15">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                      历史版本 v{viewingVersion.versionNo}
                    </span>
                    <span className="font-mono text-amber-800 dark:text-amber-200">
                      归档于 {formatDateTime(viewingVersion.archivedAt)}
                    </span>
                    <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80">
                      {timeAgo(viewingVersion.archivedAt)}
                    </span>
                  </div>
                  <button
                    onClick={() => setViewingVersion(null)}
                    className="inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium text-amber-700 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 hover:bg-amber-100/60 dark:hover:bg-amber-500/10 transition-colors"
                  >
                    返回当前版本
                  </button>
                </div>
              )}

              {/* Hero — 紧凑信息条（周期 · 状态 · 最后修改 · 生成方 · 版本） */}
              <section className="pb-6 border-b border-zinc-200 dark:border-[#333]">
                <div className="mb-3">
                  <Kicker en={`Week ${pad2(selectedReport.weekNumber)} / ${selectedReport.weekYear}`} zh="本期周报" />
                </div>
                <div className="flex items-end justify-between gap-6 flex-wrap">
                  {/* 左：周期 */}
                  <h2 className="flex items-baseline gap-3 font-mono tracking-tight text-zinc-900 dark:text-white leading-none">
                    <span className="text-[28px] md:text-[32px] font-semibold">
                      {selectedReport.startDate}
                    </span>
                    <span className="text-[22px] md:text-[24px] font-light text-zinc-300 dark:text-[#3a3a3a]">
                      →
                    </span>
                    <span className="text-[28px] md:text-[32px] font-semibold">
                      {selectedReport.endDate}
                    </span>
                  </h2>

                  {/* 右：元信息（状态 · 最后修改 · 生成方 · 版本） */}
                  <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[12px]">
                    <div className="flex flex-col gap-1">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                        Status
                      </dt>
                      <dd>
                        {viewingVersion ? (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium h-6 px-2 rounded text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-500/15">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                            历史版本
                          </span>
                        ) : (() => {
                          const meta = reportStatusMeta(selectedReport.status);
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium h-6 px-2 rounded ${meta.cls}`}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          );
                        })()}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                        {viewingVersion ? 'Archived\u00a0At' : 'Last\u00a0Modified'}
                      </dt>
                      <dd className="flex items-baseline gap-2">
                        <span className="font-mono text-[12.5px] text-zinc-800 dark:text-zinc-200">
                          {formatDateTime(viewingVersion ? viewingVersion.archivedAt : selectedReport.updatedAt)}
                        </span>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          {timeAgo(viewingVersion ? viewingVersion.archivedAt : selectedReport.updatedAt)}
                        </span>
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                        Generated&nbsp;By
                      </dt>
                      <dd className="font-mono text-[12.5px] text-zinc-600 dark:text-zinc-300">
                        {(() => {
                          const by = viewingVersion ? viewingVersion.generatedBy : selectedReport.generatedBy;
                          return by === 'system' ? 'GLM-5 · auto' : (by || '—');
                        })()}
                      </dd>
                    </div>
                    {/* Version 列 + 下拉 */}
                    <div className="flex flex-col gap-1 relative" ref={versionsMenuRef}>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                        Version
                      </dt>
                      <dd>
                        {(() => {
                          const currentVersionNo = versions.length + 1;
                          const showingVer = viewingVersion ? viewingVersion.versionNo : currentVersionNo;
                          const totalVersions = versions.length + 1; // 当前 + 历史
                          const clickable = versions.length > 0 || !!viewingVersion;
                          return (
                            <button
                              type="button"
                              onClick={() => clickable && setVersionsOpen((v) => !v)}
                              className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11.5px] font-medium transition-colors ${
                                clickable
                                  ? 'text-[#6C63FF] dark:text-[#B4AEFF] bg-[#6C63FF]/[0.08] hover:bg-[#6C63FF]/[0.14] cursor-pointer'
                                  : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-[#2a2a2a] cursor-default'
                              }`}
                            >
                              <span className="font-mono">v{showingVer}</span>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">·</span>
                              <span className="text-[10.5px]">{totalVersions} 个版本</span>
                              {clickable && (
                                <svg className={`w-3 h-3 transition-transform ${versionsOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                          );
                        })()}
                        {versionsOpen && (
                          <div className="absolute right-0 top-full mt-2 z-20 w-[320px] rounded-md border border-zinc-200 dark:border-[#363636] bg-white dark:bg-[#1f1f1f] shadow-lg overflow-hidden">
                            <div className="px-3 py-2 border-b border-zinc-100 dark:border-[#2a2a2a]">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                                Versions
                              </div>
                            </div>
                            <ul className="max-h-[340px] overflow-y-auto">
                              {/* 当前版本 */}
                              <li>
                                <button
                                  type="button"
                                  onClick={() => { setViewingVersion(null); setVersionsOpen(false); }}
                                  className={`w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#262626] transition-colors ${!viewingVersion ? 'bg-[#6C63FF]/[0.06]' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                      <span className="font-mono text-[12.5px] font-semibold text-[#6C63FF] dark:text-[#B4AEFF]">
                                        v{versions.length + 1}
                                      </span>
                                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 font-medium">
                                        当前
                                      </span>
                                    </div>
                                    <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                                      {formatDateTime(selectedReport.updatedAt)}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {selectedReport.generatedBy === 'system' ? 'GLM-5 · auto' : (selectedReport.generatedBy || '—')}
                                  </div>
                                </button>
                              </li>
                              {/* 历史版本（按 versionNo 倒序） */}
                              {versions.map((v) => (
                                <li key={v.id} className="border-t border-zinc-100 dark:border-[#2a2a2a]">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVersion(v.id)}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#262626] transition-colors ${viewingVersion?.id === v.id ? 'bg-amber-50 dark:bg-amber-500/5' : ''}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-baseline gap-2">
                                        <span className="font-mono text-[12.5px] font-semibold text-zinc-700 dark:text-zinc-200">
                                          v{v.versionNo}
                                        </span>
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-500/15 text-zinc-600 dark:text-zinc-300">
                                          历史
                                        </span>
                                      </div>
                                      <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                                        {formatDateTime(v.archivedAt)}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                      {v.generatedBy === 'system' ? 'GLM-5 · auto' : (v.generatedBy || '—')}
                                      <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                                      {timeAgo(v.archivedAt)}
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              {/* AI Summary */}
              <section className="pt-8 pb-10 border-b border-zinc-200 dark:border-[#333]">
                <div className="flex items-baseline justify-between mb-5">
                  <Kicker en="Summary" zh={viewingVersion ? `AI 总结 · 历史版 v${viewingVersion.versionNo}` : 'AI 总结'} />
                  {!viewingVersion && (!isEditing ? (
                    <button
                      onClick={() => { setEditSummary(selectedReport.summary || ''); setIsEditing(true); }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] text-zinc-600 dark:text-zinc-300 hover:text-[#6C63FF] hover:bg-[#6C63FF]/[0.06] rounded-md transition-all"
                    >
                      <IconEdit2 className="w-3.5 h-3.5" />
                      编辑
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="inline-flex items-center h-8 px-3 text-[12px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-all"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleUpdateSummary}
                        className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium bg-[#6C63FF] text-white hover:bg-[#5a52d5] rounded-md transition-all active:translate-y-[1px]"
                      >
                        <IconCheck className="w-3.5 h-3.5" />
                        保存
                      </button>
                    </div>
                  ))}
                </div>

                {(!viewingVersion && isEditing) ? (
                  <textarea
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    className="w-full min-h-[360px] p-4 rounded-md bg-white dark:bg-[#1F1F1F] border border-zinc-200 dark:border-[#363636] text-[14.5px] text-zinc-800 dark:text-zinc-100 leading-[1.75] focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15 transition-all"
                    placeholder="输入周报总结..."
                  />
                ) : (
                  <article className="max-w-[80ch] text-[14.5px] text-zinc-700 dark:text-zinc-300 leading-[1.8]">
                    {(() => {
                      const text = (viewingVersion ? viewingVersion.summary : selectedReport.summary) || '';
                      if (!text) return <span className="text-zinc-400 dark:text-zinc-500 italic">暂无总结</span>;
                      return text.split('\n').map((line: string, i: number) => {
                        // OKR Objective 标题行：匹配 "1. xxx" 或 "第 X 周周报" 或 "临时重要需求"
                        const isObjLine = /^\d+\.\s+\S/.test(line) || /^第\s*\d+\s*周周报/.test(line) || /^临时重要需求/.test(line) || /^本周排期空闲人员/.test(line);
                        // KR 标题行：匹配 "1.1 xxx"
                        const isKrLine = /^\d+\.\d+\s+\S/.test(line);
                        if (isObjLine) {
                          return <div key={i} className="font-bold text-zinc-900 dark:text-white mt-4 mb-1 first:mt-0">{line}</div>;
                        }
                        if (isKrLine) {
                          return <div key={i} className="font-semibold text-zinc-800 dark:text-zinc-200 mt-2 mb-0.5">{line}</div>;
                        }
                        if (line.trim() === '') {
                          return <div key={i} className="h-2" />;
                        }
                        return <div key={i} className="whitespace-pre-wrap">{line}</div>;
                      });
                    })()}
                  </article>
                )}
              </section>

              {/* OKR Breakdown */}
              <section className="pt-10 pb-16">
                <div className="mb-8">
                  <Kicker en="Breakdown" zh="按 OKR 维度汇总" />
                </div>

                <div className="space-y-12">
                  {[...(((viewingVersion ? viewingVersion.content : selectedReport.content)?.okrSummaries) || [])]
                    .sort((a, b) => (a.okrId || '').localeCompare(b.okrId || ''))
                    .map((okr, okrIdx) => {
                      const sortedKrs = [...(okr.krSummaries || [])].sort((a, b) =>
                        (a.krId || '').localeCompare(b.krId || '')
                      );
                      const projectCount = sortedKrs.reduce(
                        (acc, kr) => acc + (kr.projectSummaries?.length || 0), 0
                      );
                      const isUrgent = okr.okrId === 'zz-urgent';
                      const accent = isUrgent ? '#F59E0B' : '#6C63FF';
                      const badge = isUrgent ? '临' : `O${okrIdx + 1}`;

                      return (
                        <section key={okr.okrId} className="relative pl-8">
                          <span
                            className="absolute left-0 top-[6px] bottom-2 w-[3px] rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          <header className="mb-6">
                            <div className="flex items-baseline gap-3 mb-2">
                              <span
                                className="inline-flex items-center justify-center h-[22px] min-w-[28px] px-1.5 rounded text-[11px] font-bold text-white tracking-wide"
                                style={{ backgroundColor: accent }}
                              >
                                {badge}
                              </span>
                              <h3 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-snug">
                                {okr.objective || '未关联目标'}
                              </h3>
                            </div>
                            <div className="text-[11px] font-mono tracking-tight text-zinc-400 dark:text-zinc-500 uppercase">
                              {isUrgent
                                ? `${pad2(projectCount)} projects · 非 OKR 需求`
                                : `${pad2(sortedKrs.length)} KR · ${pad2(projectCount)} projects`}
                            </div>
                          </header>

                          <div className="space-y-8">
                            {sortedKrs.map((kr, krIdx) => (
                              <div key={kr.krId}>
                                <div className="flex items-baseline gap-2.5 mb-3">
                                  {!isUrgent && (
                                    <span
                                      className="text-[10px] font-mono font-semibold tracking-[0.12em]"
                                      style={{ color: accent }}
                                    >
                                      KR{okrIdx + 1}.{krIdx + 1}
                                    </span>
                                  )}
                                  <span className="text-[13.5px] font-medium text-zinc-700 dark:text-zinc-200">
                                    {kr.krDesc || '未命名关键结果'}
                                  </span>
                                </div>

                                {kr.projectSummaries && kr.projectSummaries.length > 0 ? (
                                  <ul className="divide-y divide-zinc-200/70 dark:divide-[#333] border-y border-zinc-200/70 dark:border-[#333]">
                                    {kr.projectSummaries.map((proj) => (
                                      <li
                                        key={proj.projectId}
                                        className="group py-4 transition-colors hover:bg-zinc-50/70 dark:hover:bg-[#1f1f1f]/60 rounded-sm"
                                      >
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                          <h4 className="text-[14px] font-medium text-zinc-900 dark:text-white">
                                            {proj.projectName}
                                          </h4>
                                          {proj.status && (
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${projStatusCls(proj.status)}`}>
                                              {proj.status}
                                            </span>
                                          )}
                                          {proj.priority && (
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${projPriorityCls(proj.priority)}`}>
                                              {proj.priority}
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-[13.5px] text-zinc-600 dark:text-zinc-300 leading-[1.75] whitespace-pre-wrap">
                                          {stripHtml(proj.weeklyUpdate) || (
                                            <span className="text-zinc-400 dark:text-zinc-500">—</span>
                                          )}
                                        </p>

                                        {proj.productManagers && proj.productManagers.filter(Boolean).length > 0 && (
                                          <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                                            <span className="font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                                              PM
                                            </span>
                                            <span className="text-zinc-600 dark:text-zinc-300">
                                              {proj.productManagers.filter(Boolean).join(' · ')}
                                            </span>
                                          </div>
                                        )}

                                        {/* 项目告警信息：排期缺失、排期延后、延期风险、无进展 */}
                                        {(() => {
                                          const allAlerts = [
                                            ...(proj.memberAlerts || []),
                                            ...(proj.scheduleChanges || []),
                                            ...(proj.delayRisks || []),
                                          ];
                                          if (allAlerts.length === 0) return null;
                                          return (
                                            <div className="mt-2.5 space-y-1">
                                              {allAlerts.map((alert, idx) => (
                                                <div
                                                  key={idx}
                                                  className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded px-2.5 py-1.5"
                                                >
                                                  {alert}
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">
                                    本周该 KR 下暂无项目进展
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}

                  {(() => {
                    const src = viewingVersion ? viewingVersion.content : selectedReport.content;
                    return (!src?.okrSummaries || src.okrSummaries.length === 0) ? (
                      <div className="py-16 text-center">
                        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">暂无 OKR 汇总数据</p>
                        <p className="mt-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                          No projects attached to active OKRs this week
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
              <div className="max-w-sm">
                <div className="mb-3">
                  <Kicker en="No Report" zh="暂无周报" />
                </div>
                <h2 className="text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight mb-3">
                  本周还没有周报
                </h2>
                <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  点击右上角<span className="mx-1 text-zinc-700 dark:text-zinc-300">生成本周周报</span>
                  自动汇总本周所有项目进展。
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WeeklyReportView;
