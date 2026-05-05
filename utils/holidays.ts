// 中国大陆法定节假日（已调休后实际不上班的日期）
// 数据来源：国务院办公厅年度节假日安排通知
// 注意：补班日（周末补上班）不收录 —— 补班日本身是工作日，天数计算时会自动按工作日处理
// 维护：每年底国务院发布次年安排后，在此文件追加/更新日期

const HOLIDAY_DATES: readonly string[] = [
  // ===== 2026 年（以 2025 年 11 月国务院办公厅发布的通知为准）=====
  // 元旦 1.1-1.3
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 春节 2.15-2.24（除夕至正月初八）
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', '2026-02-24',
  // 清明 4.4-4.6
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 劳动节 5.1-5.5
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 端午 6.19-6.21
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 中秋+国庆 9.25-10.4（中秋与国庆连休）
  '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
  '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',

  // ===== 2027 年（预估，待国务院正式通知发布后更新）=====
  // 元旦 1.1-1.3
  '2027-01-01', '2027-01-02', '2027-01-03',
  // 春节 农历正月初一为 2027-02-06（周六），预估除夕到初七
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10',
  '2027-02-11', '2027-02-12',
  // 清明 农历清明 2027-04-05（周一），预估 04-03 ~ 04-05
  '2027-04-03', '2027-04-04', '2027-04-05',
  // 劳动节 5.1-5.5
  '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
  // 端午 农历五月初五 2027-06-09（周三），预估 06-07 ~ 06-09
  '2027-06-07', '2027-06-08', '2027-06-09',
  // 中秋 农历八月十五 2027-09-15（周三），预估 09-15 ~ 09-17
  '2027-09-15', '2027-09-16', '2027-09-17',
  // 国庆 10.1-10.7
  '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05',
  '2027-10-06', '2027-10-07',
];

export const CHINA_HOLIDAYS: ReadonlySet<string> = new Set(HOLIDAY_DATES);

/** 格式化为 YYYY-MM-DD（本地时区，避免 toISOString 的 UTC 偏移） */
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 判断一个日期（Date 对象）是否为工作日：非周末且非法定节假日 */
export function isWorkingDay(d: Date): boolean {
  const weekday = d.getDay(); // 0=日, 6=六
  if (weekday === 0 || weekday === 6) return false;
  return !CHINA_HOLIDAYS.has(toLocalIso(d));
}

/**
 * 计算 [startDate, endDate] 内的工作日天数（含首尾）
 * 工作日 = 跨度内天数 − 周末 − 法定节假日
 * 不包含调休补班回填（用户约定"不加调休"）
 */
export function countWorkingDaysInRange(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWorkingDay(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * 计算一个成员多段 timeSlots 的工作日合计（日期重叠只计一次）
 * 忽略无效段（缺 startDate 或 endDate）
 */
export function countTimeSlotsWorkingDays(
  slots: Array<{ startDate?: string; endDate?: string }> | undefined | null,
): number {
  if (!slots || slots.length === 0) return 0;
  const uniqueDays = new Set<string>();
  for (const slot of slots) {
    if (!slot?.startDate || !slot?.endDate) continue;
    const start = new Date(`${slot.startDate}T00:00:00`);
    const end = new Date(`${slot.endDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (isWorkingDay(cursor)) uniqueDays.add(toLocalIso(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return uniqueDays.size;
}
