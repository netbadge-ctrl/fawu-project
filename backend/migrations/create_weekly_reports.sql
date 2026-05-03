-- 创建周报表
CREATE TABLE IF NOT EXISTS weekly_reports (
    id TEXT PRIMARY KEY,
    week_year INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated',
    content TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    generated_by TEXT
);

-- 创建唯一索引：每年每周只能有一条周报
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_year, week_number);

-- 创建索引：按年份查询
CREATE INDEX IF NOT EXISTS idx_weekly_reports_year ON weekly_reports(week_year);
