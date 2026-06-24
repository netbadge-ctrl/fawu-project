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

func (h *Handler) GetDevAIResearchTasks(c *gin.Context) {
	h.GetAIResearchTasks(c)
}

func (h *Handler) CreateDevAIResearchTask(c *gin.Context) {
	h.CreateAIResearchTask(c)
}

func (h *Handler) UpdateDevAIResearchTask(c *gin.Context) {
	h.UpdateAIResearchTask(c)
}

func (h *Handler) DeleteDevAIResearchTask(c *gin.Context) {
	h.DeleteAIResearchTask(c)
}

// ============= 生产模式 API =============

// GetAIResearchTasks 获取所有AI研究任务
func (h *Handler) GetAIResearchTasks(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, title, background, status, owner, expected_output, progress, blockers,
		       planned_completion_date, notes, is_completed,
		       created_at, created_by, updated_at, updated_by
		FROM ai_research_tasks
		ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch AI research tasks: " + err.Error()})
		return
	}
	defer rows.Close()

	var tasks []models.AIResearchTask
	for rows.Next() {
		var task models.AIResearchTask
		err := rows.Scan(
			&task.ID, &task.Title, &task.Background, &task.Status, &task.Owner, &task.ExpectedOutput,
			&task.Progress, &task.Blockers, &task.PlannedCompletionDate, &task.Notes, &task.IsCompleted,
			&task.CreatedAt, &task.CreatedBy, &task.UpdatedAt, &task.UpdatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan AI research task: " + err.Error()})
			return
		}
		tasks = append(tasks, task)
	}

	c.JSON(http.StatusOK, tasks)
}

// CreateAIResearchTask 创建AI研究任务
func (h *Handler) CreateAIResearchTask(c *gin.Context) {
	var task models.AIResearchTask
	if err := c.ShouldBindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if task.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}

	if task.ID == "" {
		task.ID = "art_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}

	_, err := h.db.Exec(`
		INSERT INTO ai_research_tasks (
			id, title, background, status, owner, expected_output, progress, blockers,
			planned_completion_date, notes, is_completed, created_by, updated_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		task.ID, task.Title, task.Background, task.Status, task.Owner, task.ExpectedOutput,
		task.Progress, task.Blockers, task.PlannedCompletionDate, task.Notes, task.IsCompleted,
		task.CreatedBy, task.UpdatedBy,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create AI research task: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// UpdateAIResearchTask 更新AI研究任务
func (h *Handler) UpdateAIResearchTask(c *gin.Context) {
	taskId := c.Param("taskId")

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	fieldMap := map[string]string{
		"title":                 "title",
		"background":            "background",
		"status":                "status",
		"owner":                 "owner",
		"expectedOutput":        "expected_output",
		"progress":              "progress",
		"blockers":              "blockers",
		"plannedCompletionDate": "planned_completion_date",
		"notes":                 "notes",
		"isCompleted":           "is_completed",
		"updatedBy":             "updated_by",
	}

	ignoreFields := map[string]bool{
		"id":         true,
		"createdAt":  true,
		"createdBy":  true,
		"created_at": true,
		"created_by": true,
		"updatedAt":  true,
		"updated_at": true,
		"updated_by": true,
	}

	query := "UPDATE ai_research_tasks SET "
	args := []interface{}{}
	argPos := 1
	processedFields := make(map[string]bool)

	for key, value := range updates {
		if ignoreFields[key] {
			continue
		}

		dbField := key
		if mappedField, ok := fieldMap[key]; ok {
			dbField = mappedField
		}

		if processedFields[dbField] {
			continue
		}
		processedFields[dbField] = true

		if argPos > 1 {
			query += ", "
		}
		query += fmt.Sprintf("%s = $%d", dbField, argPos)
		args = append(args, value)
		argPos++
	}

	if argPos == 1 {
		c.JSON(http.StatusOK, gin.H{"message": "No fields to update"})
		return
	}

	query += fmt.Sprintf(", updated_at = CURRENT_TIMESTAMP WHERE id = $%d", argPos)
	args = append(args, taskId)

	result, err := h.db.Exec(query, args...)
	if err != nil {
		fmt.Printf("[ERROR] SQL execution failed: %v\n", err)
		fmt.Printf("[ERROR] Query: %s\n", query)
		fmt.Printf("[ERROR] Args: %+v\n", args)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update AI research task: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "AI research task not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "AI research task updated successfully"})
}

// DeleteAIResearchTask 删除AI研究任务
func (h *Handler) DeleteAIResearchTask(c *gin.Context) {
	taskId := c.Param("taskId")

	result, err := h.db.Exec("DELETE FROM ai_research_tasks WHERE id = $1", taskId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete AI research task: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "AI research task not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "AI research task deleted successfully"})
}
