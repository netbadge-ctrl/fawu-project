-- 重建产品月会数据表
-- 注意：此脚本会删除现有数据，请谨慎使用

-- 1. 备份现有数据（如果需要）
CREATE TABLE IF NOT EXISTS monthly_work_items_backup AS 
SELECT * FROM monthly_work_items;

-- 2. 删除旧表
DROP TABLE IF EXISTS monthly_work_items CASCADE;

-- 3. 创建新表
CREATE TABLE monthly_work_items (
    id VARCHAR(50) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    work_content TEXT NOT NULL,
    business_problem TEXT,
    direction VARCHAR(50),
    product_owner VARCHAR(255),
    expected_completion_week VARCHAR(20),
    current_progress TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    progress_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50)
);

-- 4. 创建索引
CREATE INDEX idx_monthly_work_items_year_month ON monthly_work_items(year, month);
CREATE INDEX idx_monthly_work_items_created_at ON monthly_work_items(created_at DESC);

-- 5. 添加注释
COMMENT ON TABLE monthly_work_items IS '产品月会工作条目表';
COMMENT ON COLUMN monthly_work_items.id IS '工作条目ID';
COMMENT ON COLUMN monthly_work_items.year IS '年份';
COMMENT ON COLUMN monthly_work_items.month IS '月份';
COMMENT ON COLUMN monthly_work_items.work_content IS '工作内容';
COMMENT ON COLUMN monthly_work_items.business_problem IS '解决的业务问题';
COMMENT ON COLUMN monthly_work_items.direction IS '方向（业务平台/基础平台）';
COMMENT ON COLUMN monthly_work_items.product_owner IS '负责产品';
COMMENT ON COLUMN monthly_work_items.expected_completion_week IS '预计完成时间（第一周/第二周/第三周/第四周）';
COMMENT ON COLUMN monthly_work_items.current_progress IS '当前产品进展';
COMMENT ON COLUMN monthly_work_items.is_completed IS '是否完成';
COMMENT ON COLUMN monthly_work_items.progress_notes IS '进展说明';
COMMENT ON COLUMN monthly_work_items.created_at IS '创建时间';
COMMENT ON COLUMN monthly_work_items.created_by IS '创建人ID';
COMMENT ON COLUMN monthly_work_items.updated_at IS '更新时间';
COMMENT ON COLUMN monthly_work_items.updated_by IS '更新人ID';

-- 6. 如果需要恢复数据（取消注释以下行）
-- INSERT INTO monthly_work_items 
-- SELECT * FROM monthly_work_items_backup;

-- 7. 删除备份表（如果不需要保留）
-- DROP TABLE IF EXISTS monthly_work_items_backup;
