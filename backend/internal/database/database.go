package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

func Initialize(databaseURL string) (*sql.DB, error) {
	var db *sql.DB
	var err error

	// 判断数据库类型
	if strings.HasPrefix(databaseURL, "postgresql://") {
		// PostgreSQL 数据库
		db, err = sql.Open("postgres", databaseURL)
	} else {
		// SQLite 数据库
		db, err = sql.Open("sqlite3", databaseURL)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// 配置连接池（优化性能）
	// 最大打开连接数
	db.SetMaxOpenConns(25)
	// 最大空闲连接数
	db.SetMaxIdleConns(10)
	// 连接最大生命周期
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// 创建数据表
	if err := createTables(db); err != nil {
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	// 运行数据库迁移
	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

func createTables(db *sql.DB) error {
	// 检查数据库类型
	var isPostgreSQL bool
	if row := db.QueryRow("SELECT version()"); row.Err() == nil {
		var version string
		if err := row.Scan(&version); err == nil && strings.Contains(strings.ToLower(version), "postgresql") {
			isPostgreSQL = true
		}
	}

	var usersTable, okrSetsTable, projectsTable string

	if isPostgreSQL {
		// PostgreSQL 版本
		usersTable = `
		CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(255) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255),
			avatar_url VARCHAR(255),
			dept_id INTEGER,
			dept_name VARCHAR(255)
		);`

		okrSetsTable = `
		CREATE TABLE IF NOT EXISTS okr_sets (
			period_id VARCHAR(255) PRIMARY KEY,
			period_name VARCHAR(255) NOT NULL,
			okrs JSONB NOT NULL
		);`

		projectsTable = `
		CREATE TABLE IF NOT EXISTS projects (
			id VARCHAR(255) PRIMARY KEY,
			name TEXT NOT NULL,
			system VARCHAR(255),
			priority VARCHAR(50) NOT NULL,
			business_problem TEXT,
			key_result_ids TEXT[],
			weekly_update TEXT,
			last_week_update TEXT,
			status VARCHAR(50) NOT NULL,
			product_managers JSONB,
			backend_developers JSONB,
			frontend_developers JSONB,
			qa_testers JSONB,
			proposal_date DATE NULL,
			launch_date DATE NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			followers TEXT[],
			comments JSONB,
			change_log JSONB
		);`
	} else {
		// SQLite 版本
		usersTable = `
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT,
			avatar_url TEXT,
			dept_id INTEGER,
			dept_name TEXT
		);`

		okrSetsTable = `
		CREATE TABLE IF NOT EXISTS okr_sets (
			period_id TEXT PRIMARY KEY,
			period_name TEXT NOT NULL,
			okrs TEXT NOT NULL
		);`

		projectsTable = `
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			priority TEXT NOT NULL,
			business_problem TEXT,
			key_result_ids TEXT,
			weekly_update TEXT,
			last_week_update TEXT,
			status TEXT NOT NULL,
			product_managers TEXT,
			backend_developers TEXT,
			frontend_developers TEXT,
			qa_testers TEXT,
			proposal_date TEXT,
			launch_date TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			followers TEXT,
			comments TEXT,
			change_log TEXT
		);`
	}

	// 创建周报表（PG 不认 DATETIME，两边都接受 TIMESTAMP）
	weeklyReportsTable := `
	CREATE TABLE IF NOT EXISTS weekly_reports (
		id TEXT PRIMARY KEY,
		week_year INTEGER NOT NULL,
		week_number INTEGER NOT NULL,
		start_date TEXT NOT NULL,
		end_date TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'generated',
		content TEXT,
		summary TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		generated_by TEXT
	);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_year, week_number);
	CREATE INDEX IF NOT EXISTS idx_weekly_reports_year ON weekly_reports(week_year);
	`

	// 周报历史版本表（每次重新生成时将当前内容归档）
	weeklyReportVersionsTable := `
	CREATE TABLE IF NOT EXISTS weekly_report_versions (
		id TEXT PRIMARY KEY,
		report_id TEXT NOT NULL,
		week_year INTEGER NOT NULL,
		week_number INTEGER NOT NULL,
		version_no INTEGER NOT NULL,
		content TEXT,
		summary TEXT,
		generated_by TEXT,
		archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_weekly_report_versions_report_id ON weekly_report_versions(report_id);
	CREATE INDEX IF NOT EXISTS idx_weekly_report_versions_week ON weekly_report_versions(week_year, week_number);
	`

	// 项目排期快照表（v4.4.1）：每次生成周报时写入当周所有研发中项目的排期明细，
	// 供下一周生成周报时做"排期较上周是否调整"的 diff。首次生成时此表为空，不影响流程。
	projectScheduleSnapshotsTable := `
	CREATE TABLE IF NOT EXISTS project_schedule_snapshots (
		id SERIAL PRIMARY KEY,
		report_id VARCHAR(16) NOT NULL,
		iso_year INTEGER NOT NULL,
		week_number INTEGER NOT NULL,
		project_id VARCHAR(64) NOT NULL,
		role VARCHAR(16) NOT NULL,
		user_id VARCHAR(64) NOT NULL,
		user_name VARCHAR(64) NOT NULL,
		start_date DATE,
		end_date DATE,
		status VARCHAR(32),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_pss_unique
		ON project_schedule_snapshots(report_id, project_id, role, user_id, start_date);
	CREATE INDEX IF NOT EXISTS idx_pss_project_week
		ON project_schedule_snapshots(project_id, iso_year, week_number);
	CREATE INDEX IF NOT EXISTS idx_pss_week
		ON project_schedule_snapshots(iso_year, week_number);
	`

	tables := []string{usersTable, okrSetsTable, projectsTable}

	for _, table := range tables {
		if _, err := db.Exec(table); err != nil {
			return fmt.Errorf("failed to create table: %w", err)
		}
	}

	// 创建周报表
	if _, err := db.Exec(weeklyReportsTable); err != nil {
		return fmt.Errorf("failed to create weekly_reports table: %w", err)
	}
	if _, err := db.Exec(weeklyReportVersionsTable); err != nil {
		return fmt.Errorf("failed to create weekly_report_versions table: %w", err)
	}
	if _, err := db.Exec(projectScheduleSnapshotsTable); err != nil {
		return fmt.Errorf("failed to create project_schedule_snapshots table: %w", err)
	}

	return nil
}

func runMigrations(db *sql.DB) error {
	// 检查数据库类型
	var isPostgreSQL bool
	if row := db.QueryRow("SELECT version()"); row.Err() == nil {
		var version string
		if err := row.Scan(&version); err == nil && strings.Contains(strings.ToLower(version), "postgresql") {
			isPostgreSQL = true
		}
	}

	if isPostgreSQL {
		// PostgreSQL 迁移
		addCreatedAtColumn := `
		DO $$ 
		BEGIN 
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns 
				WHERE table_name = 'projects' AND column_name = 'created_at'
			) THEN
				ALTER TABLE projects ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
				-- 为现有项目设置创建时间（使用当前时间）
				UPDATE projects SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
			END IF;
		END $$;`

		if _, err := db.Exec(addCreatedAtColumn); err != nil {
			return fmt.Errorf("failed to add created_at column: %w", err)
		}

		// 添加 documents 字段
		addDocumentsColumn := `
		DO $$ 
		BEGIN 
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns 
				WHERE table_name = 'projects' AND column_name = 'documents'
			) THEN
				ALTER TABLE projects ADD COLUMN documents JSONB DEFAULT '[]'::jsonb;
			END IF;
		END $$;`

		if _, err := db.Exec(addDocumentsColumn); err != nil {
			return fmt.Errorf("failed to add documents column: %w", err)
		}

		// 创建产品月会工作条目表
		createMonthlyWorkItemsTable := `
		CREATE TABLE IF NOT EXISTS monthly_work_items (
			id VARCHAR(50) PRIMARY KEY,
			year INTEGER NOT NULL,
			month INTEGER NOT NULL,
			
			-- 工作内容字段
			work_content TEXT NOT NULL,
			business_problem TEXT,
			direction VARCHAR(50),
			product_owner VARCHAR(255),
			
			-- 预计需求完成时间（枚举：第一周、第二周、第三周、第四周）
			expected_completion_week VARCHAR(20),
			
			-- 当前产品进展和完成状态
			current_progress TEXT,
			is_completed BOOLEAN DEFAULT FALSE,
			progress_notes TEXT,
			
			-- 元数据
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(50),
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_by VARCHAR(50)
		);`

		if _, err := db.Exec(createMonthlyWorkItemsTable); err != nil {
			return fmt.Errorf("failed to create monthly_work_items table: %w", err)
		}

		// 创建索引
		createWorkItemIndexes := `
		CREATE INDEX IF NOT EXISTS idx_monthly_work_items_year_month ON monthly_work_items(year, month);
		CREATE INDEX IF NOT EXISTS idx_monthly_work_items_created_at ON monthly_work_items(created_at);`

		if _, err := db.Exec(createWorkItemIndexes); err != nil {
			return fmt.Errorf("failed to create indexes for monthly_work_items: %w", err)
		}

		// 创建AI研究任务表
		createAIResearchTasksTable := `
		CREATE TABLE IF NOT EXISTS ai_research_tasks (
			id VARCHAR(50) PRIMARY KEY,
			title TEXT NOT NULL,
			background TEXT,
			status VARCHAR(50),
			owner VARCHAR(255),
			expected_output VARCHAR(50),
			progress TEXT,
			blockers TEXT,
			planned_completion_date DATE,
			notes TEXT,
			is_completed BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(50),
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_by VARCHAR(50)
		);`

		if _, err := db.Exec(createAIResearchTasksTable); err != nil {
			return fmt.Errorf("failed to create ai_research_tasks table: %w", err)
		}

		// 创建AI研究任务索引
		createAIResearchTaskIndexes := `
		CREATE INDEX IF NOT EXISTS idx_ai_research_tasks_status ON ai_research_tasks(status);
		CREATE INDEX IF NOT EXISTS idx_ai_research_tasks_owner ON ai_research_tasks(owner);
		CREATE INDEX IF NOT EXISTS idx_ai_research_tasks_created_at ON ai_research_tasks(created_at);`

		if _, err := db.Exec(createAIResearchTaskIndexes); err != nil {
			return fmt.Errorf("failed to create indexes for ai_research_tasks: %w", err)
		}
	}
	// SQLite 不需要特殊的迁移，因为表创建时已经包含了所有字段

	return nil
}
