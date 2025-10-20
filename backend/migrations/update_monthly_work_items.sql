-- 更新产品月会工作条目表结构
-- 删除旧的周次完成字段，添加新的预计完成时间字段

-- 1. 删除旧的布尔字段
ALTER TABLE monthly_work_items DROP COLUMN IF EXISTS week1_completion;
ALTER TABLE monthly_work_items DROP COLUMN IF EXISTS week2_completion;
ALTER TABLE monthly_work_items DROP COLUMN IF EXISTS week3_completion;
ALTER TABLE monthly_work_items DROP COLUMN IF EXISTS week4_completion;

-- 2. 添加新的字段
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS expected_completion_week VARCHAR(20);
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS progress_notes TEXT;
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(50);
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE monthly_work_items ADD COLUMN IF NOT EXISTS updated_by VARCHAR(50);

-- 3. 添加注释
COMMENT ON COLUMN monthly_work_items.expected_completion_week IS '预计需求完成时间（第一周、第二周、第三周、第四周）';
COMMENT ON COLUMN monthly_work_items.is_completed IS '是否完成';
COMMENT ON COLUMN monthly_work_items.progress_notes IS '进展说明';
