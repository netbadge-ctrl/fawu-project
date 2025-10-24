package scheduler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"project-management-backend/internal/models"

	"github.com/robfig/cron/v3"
)

func Start(db *sql.DB) {
	c := cron.New()

	// 每天上午11:00执行员工数据同步
	c.AddFunc("0 11 * * *", func() {
		log.Println("Starting employee data sync...")
		if err := syncEmployeeData(db); err != nil {
			log.Printf("Employee sync failed: %v", err)
		} else {
			log.Println("Employee data sync completed successfully")
		}
	})

	c.Start()
	log.Println("Scheduler started - employee sync scheduled for 11:00 AM daily")
}

func syncEmployeeData(db *sql.DB) error {
	const maxRetries = 3
	const retryDelay = time.Minute

	var employeeResp models.EmployeeResponse
	var err error

	// 重试机制
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("Attempting to fetch employee data (attempt %d/%d)", attempt, maxRetries)

		employeeResp, err = fetchEmployeeData()
		if err == nil {
			break
		}

		log.Printf("Attempt %d failed: %v", attempt, err)
		if attempt < maxRetries {
			log.Printf("Retrying in %v...", retryDelay)
			time.Sleep(retryDelay)
		}
	}

	if err != nil {
		return fmt.Errorf("failed to fetch employee data after %d attempts: %w", maxRetries, err)
	}

	// 处理员工数据
	employees, exists := employeeResp.EmployeeList["28508728"]
	if !exists {
		return fmt.Errorf("department 28508728 not found in response")
	}

	log.Printf("Processing %d employees", len(employees))

	for _, employee := range employees {
		if err := upsertEmployee(db, employee); err != nil {
			log.Printf("Failed to upsert employee %d: %v", employee.EmployeeID, err)
			continue
		}
	}

	log.Printf("Successfully processed %d employees", len(employees))
	return nil
}

func fetchEmployeeData() (models.EmployeeResponse, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", "http://10.69.67.224/dept/employee/list?dept_ids=28508728", nil)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to create request: %w", err)
	}

	// 设置请求头
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Basic QUs1YWRkZDVkMjJiNThiOlNLNWFkZGQ1ZDIyYjVjYg==")
	req.Header.Set("Host", "contact.inner.sdns.ksyun.com")

	resp, err := client.Do(req)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return models.EmployeeResponse{}, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to read response body: %w", err)
	}

	var employeeResp models.EmployeeResponse
	if err := json.Unmarshal(body, &employeeResp); err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return employeeResp, nil
}

func upsertEmployee(db *sql.DB, employee models.Employee) error {
	userID := strconv.Itoa(employee.EmployeeID)
	avatarURL := fmt.Sprintf("https://picsum.photos/seed/%d/40/40", employee.EmployeeID)

	// 根据部门ID获取部门名称
	deptName := getDepartmentName(employee.DeptID)

	// 检查用户是否存在
	var exists bool
	checkQuery := "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)"
	err := db.QueryRow(checkQuery, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check user existence: %w", err)
	}

	if exists {
		// 更新现有用户
		updateQuery := "UPDATE users SET name = $1, email = $2, dept_id = $3, dept_name = $4 WHERE id = $5"
		_, err = db.Exec(updateQuery, employee.RealName, employee.Email, employee.DeptID, deptName, userID)
		if err != nil {
			return fmt.Errorf("failed to update user: %w", err)
		}
		log.Printf("Updated user: %s (%s)", employee.RealName, userID)
	} else {
		// 插入新用户
		insertQuery := "INSERT INTO users (id, name, email, avatar_url, dept_id, dept_name) VALUES ($1, $2, $3, $4, $5, $6)"
		_, err = db.Exec(insertQuery, userID, employee.RealName, employee.Email, avatarURL, employee.DeptID, deptName)
		if err != nil {
			return fmt.Errorf("failed to insert user: %w", err)
		}
		log.Printf("Inserted new user: %s (%s)", employee.RealName, userID)
	}

	return nil
}

// getDepartmentName 根据部门ID获取部门名称
func getDepartmentName(deptID int) string {
	// 根据实际的部门ID映射部门名称
	switch deptID {
	case 28508728:
		return "技术部"
	case 28508729:
		return "产品管理部"
	case 28508731:
		return "业务平台研发部"
	case 28508815:
		return "基础平台研发部"
	case 28508730:
		return "前端技术部"
	case 28507849:
		return "测试部"
	case 28508521:
		return "SRE平台组"
	default:
		return fmt.Sprintf("部门%d", deptID)
	}
}
