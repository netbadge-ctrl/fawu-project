-- v4.5.0 迁移：projects 表字段重命名 + 角色精简
-- 删除后端研发 / 前端研发 / 测试 三类角色，产品经理 → 负责人
-- system → business_direction（业务方向）
-- business_problem → business_background（业务背景）
-- launch_date → completion_date（完成日期）

ALTER TABLE projects DROP COLUMN IF EXISTS backend_developers;
ALTER TABLE projects DROP COLUMN IF EXISTS frontend_developers;
ALTER TABLE projects DROP COLUMN IF EXISTS qa_testers;
ALTER TABLE projects RENAME COLUMN product_managers TO owner;
ALTER TABLE projects RENAME COLUMN system TO business_direction;
ALTER TABLE projects RENAME COLUMN business_problem TO business_background;
ALTER TABLE projects RENAME COLUMN launch_date TO completion_date;

-- time_slots 角色记录同步
DELETE FROM time_slots WHERE role_key IN ('backendDevelopers', 'frontendDevelopers', 'qaTesters');
UPDATE time_slots SET role_key = 'owners' WHERE role_key = 'productManagers';
