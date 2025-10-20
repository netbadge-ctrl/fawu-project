package database

import (
	"database/sql"
	"fmt"
	"strings"

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

	tables := []string{usersTable, okrSetsTable, projectsTable}

	for _, table := range tables {
		if _, err := db.Exec(table); err != nil {
			return fmt.Errorf("failed to create table: %w", err)
		}
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
	}
	// SQLite 不需要特殊的迁移，因为表创建时已经包含了所有字段

	return nil
}
