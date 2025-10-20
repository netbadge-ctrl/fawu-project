package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"project-management-backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ============= 开发模式 API =============

// GetDevMonthlyWorkItems 获取所有月度工作条目（开发模式）
func (h *Handler) GetDevMonthlyWorkItems(c *gin.Context) {
	h.GetMonthlyWorkItems(c)
}

// GetDevMonthlyWorkItemsByMonth 获取指定年月的工作条目（开发模式）
func (h *Handler) GetDevMonthlyWorkItemsByMonth(c *gin.Context) {
	h.GetMonthlyWorkItemsByMonth(c)
}

// CreateDevMonthlyWorkItem 创建月度工作条目（开发模式）
func (h *Handler) CreateDevMonthlyWorkItem(c *gin.Context) {
	h.CreateMonthlyWorkItem(c)
}

// UpdateDevMonthlyWorkItem 更新月度工作条目（开发模式）
func (h *Handler) UpdateDevMonthlyWorkItem(c *gin.Context) {
	h.UpdateMonthlyWorkItem(c)
}

// DeleteDevMonthlyWorkItem 删除月度工作条目（开发模式）
func (h *Handler) DeleteDevMonthlyWorkItem(c *gin.Context) {
	h.DeleteMonthlyWorkItem(c)
}

// ============= 生产模式 API =============

// GetMonthlyWorkItems 获取所有月度工作条目
func (h *Handler) GetMonthlyWorkItems(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, year, month, work_content, business_problem, direction, product_owner,
		       expected_completion_week, current_progress, is_completed, progress_notes,
		       created_at, created_by, updated_at, updated_by
		FROM monthly_work_items
		ORDER BY year DESC, month DESC, created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch work items: " + err.Error()})
		return
	}
	defer rows.Close()

	var workItems []models.MonthlyWorkItem
	for rows.Next() {
		var item models.MonthlyWorkItem
		err := rows.Scan(
			&item.ID, &item.Year, &item.Month, &item.WorkContent, &item.BusinessProblem,
			&item.Direction, &item.ProductOwner, &item.ExpectedCompletionWeek,
			&item.CurrentProgress, &item.IsCompleted, &item.ProgressNotes,
			&item.CreatedAt, &item.CreatedBy, &item.UpdatedAt, &item.UpdatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan work item: " + err.Error()})
			return
		}
		workItems = append(workItems, item)
	}

	c.JSON(http.StatusOK, workItems)
}

// GetMonthlyWorkItemsByMonth 获取指定年月的工作条目
func (h *Handler) GetMonthlyWorkItemsByMonth(c *gin.Context) {
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid year"})
		return
	}

	month, err := strconv.Atoi(c.Param("month"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid month"})
		return
	}

	rows, err := h.db.Query(`
		SELECT id, year, month, work_content, business_problem, direction, product_owner,
		       expected_completion_week, current_progress, is_completed, progress_notes,
		       created_at, created_by, updated_at, updated_by
		FROM monthly_work_items
		WHERE year = $1 AND month = $2
		ORDER BY created_at DESC
	`, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch work items: " + err.Error()})
		return
	}
	defer rows.Close()

	var workItems []models.MonthlyWorkItem
	for rows.Next() {
		var item models.MonthlyWorkItem
		err := rows.Scan(
			&item.ID, &item.Year, &item.Month, &item.WorkContent, &item.BusinessProblem,
			&item.Direction, &item.ProductOwner, &item.ExpectedCompletionWeek,
			&item.CurrentProgress, &item.IsCompleted, &item.ProgressNotes,
			&item.CreatedAt, &item.CreatedBy, &item.UpdatedAt, &item.UpdatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan work item: " + err.Error()})
			return
		}
		workItems = append(workItems, item)
	}

	c.JSON(http.StatusOK, workItems)
}

// CreateMonthlyWorkItem 创建月度工作条目
func (h *Handler) CreateMonthlyWorkItem(c *gin.Context) {
	var workItem models.MonthlyWorkItem
	if err := c.ShouldBindJSON(&workItem); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 生成ID
	if workItem.ID == "" {
		workItem.ID = "mwi_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}

	_, err := h.db.Exec(`
		INSERT INTO monthly_work_items (
			id, year, month, work_content, business_problem, direction, product_owner,
			expected_completion_week, current_progress, is_completed, progress_notes,
			created_by, updated_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		workItem.ID, workItem.Year, workItem.Month, workItem.WorkContent, workItem.BusinessProblem,
		workItem.Direction, workItem.ProductOwner, workItem.ExpectedCompletionWeek,
		workItem.CurrentProgress, workItem.IsCompleted, workItem.ProgressNotes,
		workItem.CreatedBy, workItem.UpdatedBy,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create work item: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, workItem)
}

// UpdateMonthlyWorkItem 更新月度工作条目
func (h *Handler) UpdateMonthlyWorkItem(c *gin.Context) {
	itemId := c.Param("itemId")

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 构建动态更新SQL
	query := "UPDATE monthly_work_items SET "
	args := []interface{}{}
	argPos := 1

	for key, value := range updates {
		if argPos > 1 {
			query += ", "
		}
		query += fmt.Sprintf("%s = $%d", key, argPos)
		args = append(args, value)
		argPos++
	}

	query += fmt.Sprintf(", updated_at = CURRENT_TIMESTAMP WHERE id = $%d", argPos)
	args = append(args, itemId)

	result, err := h.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update work item: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Work item not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Work item updated successfully"})
}

// DeleteMonthlyWorkItem 删除月度工作条目
func (h *Handler) DeleteMonthlyWorkItem(c *gin.Context) {
	itemId := c.Param("itemId")

	result, err := h.db.Exec("DELETE FROM monthly_work_items WHERE id = $1", itemId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete work item: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Work item not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Work item deleted successfully"})
}
