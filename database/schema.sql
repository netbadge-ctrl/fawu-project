-- ============================================
-- 项目管理系统数据库 DDL (PostgreSQL)
-- ============================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    avatar_url VARCHAR(255),
    dept_id INTEGER,
    dept_name VARCHAR(255)
);

COMMENT ON TABLE users IS '用户表，存储系统用户信息';
COMMENT ON COLUMN users.id IS '用户唯一标识符';
COMMENT ON COLUMN users.name IS '用户姓名';
COMMENT ON COLUMN users.email IS '用户邮箱';
COMMENT ON COLUMN users.avatar_url IS '头像URL';
COMMENT ON COLUMN users.dept_id IS '部门ID';
COMMENT ON COLUMN users.dept_name IS '部门名称';

-- 2. OKR 集合表
CREATE TABLE IF NOT EXISTS okr_sets (
    period_id VARCHAR(255) PRIMARY KEY,
    period_name VARCHAR(255) NOT NULL,
    okrs JSONB NOT NULL
);

COMMENT ON TABLE okr_sets IS 'OKR周期集合表，存储每个周期的OKR数据';
COMMENT ON COLUMN okr_sets.period_id IS '周期唯一标识符';
COMMENT ON COLUMN okr_sets.period_name IS '周期名称（如：2026 Q1）';
COMMENT ON COLUMN okr_sets.okrs IS 'OKR数据（JSONB格式）';

-- 3. 项目表
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY,
    name TEXT NOT NULL,
    business_direction VARCHAR(255),
    priority VARCHAR(50) NOT NULL DEFAULT '日常需求',
    business_background TEXT,
    key_result_ids TEXT[],
    weekly_update TEXT,
    last_week_update TEXT,
    status VARCHAR(50) NOT NULL DEFAULT '未开始',
    owner JSONB DEFAULT '[]'::jsonb,
    proposal_date DATE,
    completion_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    followers TEXT[],
    comments JSONB DEFAULT '[]'::jsonb,
    change_log JSONB DEFAULT '[]'::jsonb,
    documents JSONB DEFAULT '[]'::jsonb
);

COMMENT ON TABLE projects IS '项目表，存储项目基本信息';
COMMENT ON COLUMN projects.id IS '项目唯一标识符（格式：p + 时间戳）';
COMMENT ON COLUMN projects.name IS '项目名称';
COMMENT ON COLUMN projects.business_direction IS '业务方向';
COMMENT ON COLUMN projects.priority IS '优先级（P0需求/P1需求/部门OKR/日常需求）';
COMMENT ON COLUMN projects.business_background IS '业务背景';
COMMENT ON COLUMN projects.key_result_ids IS '关联的KR ID数组';
COMMENT ON COLUMN projects.weekly_update IS '本周进展';
COMMENT ON COLUMN projects.last_week_update IS '上周进展';
COMMENT ON COLUMN projects.status IS '项目状态（未开始/进行中/已上线/已暂停）';
COMMENT ON COLUMN projects.owner IS '负责人（JSONB数组）';
COMMENT ON COLUMN projects.proposal_date IS '提出日期';
COMMENT ON COLUMN projects.completion_date IS '完成日期';
COMMENT ON COLUMN projects.created_at IS '创建时间';
COMMENT ON COLUMN projects.followers IS '关注者ID数组';
COMMENT ON COLUMN projects.comments IS '评论列表（JSONB）';
COMMENT ON COLUMN projects.change_log IS '变更记录（JSONB）';
COMMENT ON COLUMN projects.documents IS '文档列表（JSONB）';

-- 4. 时段配置表（多时段支持）
CREATE TABLE IF NOT EXISTS time_slots (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    role_key VARCHAR(50) NOT NULL,
    start_date DATE,
    end_date DATE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束
    CONSTRAINT fk_time_slots_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_time_slots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

COMMENT ON TABLE time_slots IS '时段配置表，存储项目成员的多时段配置';
COMMENT ON COLUMN time_slots.id IS '时段唯一标识符';
COMMENT ON COLUMN time_slots.project_id IS '关联项目ID';
COMMENT ON COLUMN time_slots.user_id IS '关联用户ID';
COMMENT ON COLUMN time_slots.role_key IS '角色标识（productManagers/backendDevelopers/frontendDevelopers/qaTesters）';
COMMENT ON COLUMN time_slots.start_date IS '开始日期';
COMMENT ON COLUMN time_slots.end_date IS '结束日期';
COMMENT ON COLUMN time_slots.description IS '时段描述';
COMMENT ON COLUMN time_slots.created_at IS '创建时间';
COMMENT ON COLUMN time_slots.updated_at IS '更新时间';

-- 5. 月度工作条目表
CREATE TABLE IF NOT EXISTS monthly_work_items (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50),
    
    -- 唯一约束：每个年月只能有一条记录
    CONSTRAINT uq_monthly_work_items_year_month UNIQUE (year, month)
);

COMMENT ON TABLE monthly_work_items IS '月度工作条目表，存储产品月会的工作内容';
COMMENT ON COLUMN monthly_work_items.id IS '工作条目唯一标识符';
COMMENT ON COLUMN monthly_work_items.year IS '年份';
COMMENT ON COLUMN monthly_work_items.month IS '月份（1-12）';
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

-- ============================================
-- 创建索引
-- ============================================

-- 项目表索引
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);

-- 时段表索引
CREATE INDEX IF NOT EXISTS idx_time_slots_project_user ON time_slots(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_project_role ON time_slots(project_id, role_key);
CREATE INDEX IF NOT EXISTS idx_time_slots_date_range ON time_slots(start_date, end_date);

-- 月度工作条目索引
CREATE INDEX IF NOT EXISTS idx_monthly_work_items_year_month ON monthly_work_items(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_work_items_created_at ON monthly_work_items(created_at DESC);

-- ============================================
-- 创建更新时间触发器
-- ============================================

-- 自动更新 updated_at 字段的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为 time_slots 表添加触发器
DROP TRIGGER IF EXISTS update_time_slots_updated_at ON time_slots;
CREATE TRIGGER update_time_slots_updated_at
    BEFORE UPDATE ON time_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为 monthly_work_items 表添加触发器
DROP TRIGGER IF EXISTS update_monthly_work_items_updated_at ON monthly_work_items;
CREATE TRIGGER update_monthly_work_items_updated_at
    BEFORE UPDATE ON monthly_work_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
