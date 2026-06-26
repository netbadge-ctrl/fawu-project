package config

import (
	"os"
)

type Config struct {
	DatabaseURL string
	Port        string
}

func Load() *Config {
	// 默认连接线上数据库
	databaseURL := "postgresql://admin:Kingsoft0531@120.92.122.77:59971/project_codebuddy?sslmode=disable"

	// 如果显式设置了DATABASE_URL环境变量，则使用它
	if envURL := os.Getenv("DATABASE_URL"); envURL != "" {
		databaseURL = envURL
	}

	return &Config{
		DatabaseURL: databaseURL,
		Port:        getEnv("PORT", "9000"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
