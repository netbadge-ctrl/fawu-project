-- 创建产品月会数据表
CREATE TABLE IF NOT EXISTS monthly_meetings (
    id VARCHAR(50) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    
    -- 月初目标
    monthly_goals TEXT,
    goals_created_at TIMESTAMP,
    goals_created_by VARCHAR(50),
    
    -- 月末总结
    monthly_summary TEXT,
    summary_created_at TIMESTAMP,
    summary_created_by VARCHAR(50),
    
    -- 关联的项目和OKR
    related_project_ids TEXT[], -- 存储项目ID数组
    related_okr_ids TEXT[],      -- 存储OKR ID数组
    
    -- 参与人员
    participants TEXT[],         -- 存储用户ID数组
    
    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 确保每个年月只有一条记录
    UNIQUE(year, month)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_monthly_meetings_year_month ON monthly_meetings(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_meetings_created_at ON monthly_meetings(created_at);

-- 添加注释
COMMENT ON TABLE monthly_meetings IS '产品月会数据表，存储月初目标和月末总结';
COMMENT ON COLUMN monthly_meetings.id IS '月会唯一标识符';
COMMENT ON COLUMN monthly_meetings.year IS '年份';
COMMENT ON COLUMN monthly_meetings.month IS '月份(1-12)';
COMMENT ON COLUMN monthly_meetings.monthly_goals IS '月初制定的目标(富文本HTML)';
COMMENT ON COLUMN monthly_meetings.monthly_summary IS '月末总结(富文本HTML)';
COMMENT ON COLUMN monthly_meetings.related_project_ids IS '关联的项目ID列表';
COMMENT ON COLUMN monthly_meetings.related_okr_ids IS '关联的OKR ID列表';
COMMENT ON COLUMN monthly_meetings.participants IS '参与人员ID列表';
