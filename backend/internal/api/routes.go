package api

import (
	"database/sql"
	"net/http"

	"project-management-backend/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(db *sql.DB) *gin.Engine {
	router := gin.Default()

	// 配置CORS
	config := cors.DefaultConfig()
	// 明确指定允许的源地址（生产环境和本地开发环境）
	config.AllowOrigins = []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://120.92.44.21:5173",
	}
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"}
	config.ExposeHeaders = []string{"Content-Length"}
	config.AllowCredentials = true
	config.MaxAge = 12 * 3600 // 预检请求缓存12小时
	router.Use(cors.New(config))

	// 创建处理器
	handler := NewHandler(db)

	// API路由组
	api := router.Group("/api")
	{
		// 公开路由（不需要认证）
		public := api.Group("")
		{
			// 认证相关路由
			public.GET("/check-auth", handler.CheckAuth)
			public.POST("/oidc-token", handler.OIDCTokenExchange)
			public.POST("/jwt-login", handler.JWTLogin) // 新增JWT登录端点

			// 开发模式专用端点（仅用于本地开发）
			public.GET("/dev/mock-user", handler.GetMockUser)   // 获取模拟用户
			public.GET("/dev/projects", handler.GetDevProjects) // 获取项目数据（开发模式）
			public.GET("/dev/users", handler.GetDevUsers)       // 获取用户数据（开发模式）
			public.GET("/dev/okr-sets", handler.GetDevOkrSets)  // 获取OKR数据（开发模式）
			// 开发模式写操作端点
			public.POST("/dev/projects", handler.CreateDevProject)                        // 创建项目（开发模式）
			public.PATCH("/dev/projects/:projectId", handler.UpdateDevProject)            // 更新项目（开发模式）
			public.DELETE("/dev/projects/:projectId", handler.DeleteDevProject)           // 删除项目（开发模式）
			public.POST("/dev/okr-sets", handler.CreateDevOkrSet)                         // 创建OKR集合（开发模式）
			public.PUT("/dev/okr-sets/:periodId", handler.UpdateDevOkrSet)                // 更新OKR集合（开发模式）
			public.POST("/dev/perform-weekly-rollover", handler.PerformDevWeeklyRollover) // 周度滚动（开发模式）
			// KR ID修复相关端点（开发模式）
			public.POST("/dev/reinitialize-okr-data", handler.ReinitializeOkrData)          // 重新初始化OKR数据，修复KR ID重复问题
			public.POST("/dev/smart-migrate-kr-data", handler.SmartMigrateKrData)           // 智能KR数据迁移，保留现有项目的KR关联
			public.POST("/dev/add-sample-kr-associations", handler.AddSampleKrAssociations) // 为示例项目添加KR关联
			// AI研究任务相关端点（开发模式）
			public.GET("/dev/ai-research-tasks", handler.GetDevAIResearchTasks)               // 获取所有AI研究任务
			public.POST("/dev/ai-research-tasks", handler.CreateDevAIResearchTask)            // 创建AI研究任务
			public.PATCH("/dev/ai-research-tasks/:taskId", handler.UpdateDevAIResearchTask)   // 更新AI研究任务
			public.DELETE("/dev/ai-research-tasks/:taskId", handler.DeleteDevAIResearchTask)  // 删除AI研究任务
			// 周报相关端点（开发模式）
			public.GET("/dev/weekly-reports", handler.GetDevWeeklyReports)
			public.GET("/dev/weekly-reports/:year/:week", handler.GetDevWeeklyReportByWeek)
			public.POST("/dev/weekly-reports/generate", handler.GenerateDevWeeklyReport)
			public.PATCH("/dev/weekly-reports/:reportId", handler.UpdateDevWeeklyReport)
			public.POST("/dev/weekly-reports/regenerate/:reportId", handler.RegenerateDevWeeklyReport)
			public.GET("/dev/weekly-reports/versions/:reportId", handler.GetDevWeeklyReportVersions)
			public.GET("/dev/weekly-report-versions/:versionId", handler.GetDevWeeklyReportVersionByID)
			// 员工同步端点（开发模式）
			public.POST("/dev/sync-employees", handler.SyncEmployeeData) // 同步员工数据（开发模式）
		}

		// 受保护的路由（需要JWT认证）
		protected := api.Group("", middleware.AuthMiddleware())
		{
			// 项目相关路由（敏感数据，需要认证）
			protected.GET("/projects", handler.GetProjects)
			protected.GET("/projects/:projectId", handler.GetProjectDetail)
			protected.POST("/projects", handler.CreateProject)
			protected.PATCH("/projects/:projectId", handler.UpdateProject)
			protected.DELETE("/projects/:projectId", handler.DeleteProject)

			// OKR相关路由（敏感数据，需要认证）
			protected.GET("/okr-sets", handler.GetOkrSets)
			protected.POST("/okr-sets", handler.CreateOkrSet)
			protected.PUT("/okr-sets/:periodId", handler.UpdateOkrSet)

			// 用户相关路由（敏感数据，需要认证）
			protected.GET("/users", handler.GetUsers)
			protected.POST("/refresh-users", handler.RefreshUsers)
			protected.POST("/sync-employees", handler.SyncEmployeeData)

			// 周会相关路由（敏感数据，需要认证）
			protected.POST("/perform-weekly-rollover", handler.PerformWeeklyRollover)

			// 数据迁移路由（一次性使用，需要认证）
			protected.POST("/migrate-initial-data", handler.MigrateInitialData)

			// AI研究任务相关路由（需要认证）
			protected.GET("/ai-research-tasks", handler.GetAIResearchTasks)
			protected.POST("/ai-research-tasks", handler.CreateAIResearchTask)
			protected.PATCH("/ai-research-tasks/:taskId", handler.UpdateAIResearchTask)
			protected.DELETE("/ai-research-tasks/:taskId", handler.DeleteAIResearchTask)

			// 周报相关路由（需要认证）
			protected.GET("/weekly-reports", handler.GetWeeklyReports)
			protected.GET("/weekly-reports/:year/:week", handler.GetWeeklyReportByWeek)
			protected.POST("/weekly-reports/generate", handler.GenerateWeeklyReport)
			protected.PATCH("/weekly-reports/:reportId", handler.UpdateWeeklyReport)
			protected.POST("/weekly-reports/regenerate/:reportId", handler.RegenerateWeeklyReport)
			protected.GET("/weekly-reports/versions/:reportId", handler.GetWeeklyReportVersions)
			protected.GET("/weekly-report-versions/:versionId", handler.GetWeeklyReportVersionByID)
		}
	}

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return router
}
