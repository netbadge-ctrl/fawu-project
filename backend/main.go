package main

import (
	"log"
	"os"
	"project-management-backend/internal/api"
	"project-management-backend/internal/config"
	"project-management-backend/internal/database"
	"project-management-backend/internal/scheduler"
)

func main() {
	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	db, err := database.Initialize(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.Close()

	// 启动定时任务：本地联调连线上库时可通过 DISABLE_SCHEDULER=true 关闭，
	// 避免和线上正式 backend 重复触发（如每周四 20:00 自动生成周报、每天 11:00 同步员工等）。
	if os.Getenv("DISABLE_SCHEDULER") == "true" {
		log.Println("Scheduler disabled by DISABLE_SCHEDULER=true (skip cron jobs to avoid double-fire against prod DB)")
	} else {
		scheduler.Start(db)
	}

	// 启动 API 服务器
	router := api.SetupRouter(db)
	log.Printf("Server starting on 0.0.0.0:%s", cfg.Port)
	if err := router.Run("0.0.0.0:" + cfg.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
