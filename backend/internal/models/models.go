package models

import (
	"database/sql/driver"
	"errors"
)

// User 用户模型
type User struct {
	ID        string `json:"id" db:"id"`
	Name      string `json:"name" db:"name"`
	Email     string `json:"email" db:"email"`
	AvatarURL string `json:"avatarUrl" db:"avatar_url"`
	DeptID    int    `json:"deptId" db:"dept_id"`
	DeptName  string `json:"deptName" db:"dept_name"`
}

// TimeSlot 单个时段配置
type TimeSlot struct {
	ID          string  `json:"id"`
	StartDate   string  `json:"startDate"`
	EndDate     string  `json:"endDate"`
	Description *string `json:"description,omitempty"`
}

// TeamMember 团队成员
type TeamMember struct {
	UserID            string     `json:"userId"`
	TimeSlots         []TimeSlot `json:"timeSlots"`
	UseSharedSchedule bool       `json:"useSharedSchedule,omitempty"`
	// 兼容性字段，用于向后兼容
	StartDate *string `json:"startDate,omitempty"`
	EndDate   *string `json:"endDate,omitempty"`
}

// Role 角色类型
type Role []TeamMember

// Comment 评论
type Comment struct {
	ID        string   `json:"id"`
	UserID    string   `json:"userId"`
	Text      string   `json:"text"`
	CreatedAt string   `json:"createdAt"`
	Mentions  []string `json:"mentions,omitempty"`
}

// ChangeLogEntry 变更日志条目
type ChangeLogEntry struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Field     string `json:"field"`
	OldValue  string `json:"oldValue"`
	NewValue  string `json:"newValue"`
	ChangedAt string `json:"changedAt"`
}

// Document 文档链接
type Document struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	CreatedAt string `json:"createdAt"`
	CreatedBy string `json:"createdBy"`
}

// KeyResult OKR关键结果
// 注意：KR ID现在采用复合格式 "okrId::krSequence"，确保全局唯一性
// 例如："o1::kr1", "o2::kr1" 等
type KeyResult struct {
	ID          string `json:"id"`          // 复合ID格式：okrId::krSequence
	Sequence    string `json:"sequence"`    // 原始序列号，如 "kr1", "kr2"
	Description string `json:"description"`
}

// OKR 目标与关键结果
type OKR struct {
	ID         string      `json:"id"`
	Objective  string      `json:"objective"`
	KeyResults []KeyResult `json:"keyResults"`
}

// OkrSet OKR周期集合
type OkrSet struct {
	PeriodID   string `json:"periodId" db:"period_id"`
	PeriodName string `json:"periodName" db:"period_name"`
	Okrs       []OKR  `json:"okrs" db:"okrs"`
}

// MonthlyMeeting 产品月会模型
type MonthlyWorkItem struct {
	ID                      string  `json:"id" db:"id"`
	Year                    int     `json:"year" db:"year"`
	Month                   int     `json:"month" db:"month"`
	WorkContent             string  `json:"workContent" db:"work_content"`
	BusinessProblem         *string `json:"businessProblem" db:"business_problem"`
	Direction               *string `json:"direction" db:"direction"`
	ProductOwner            *string `json:"productOwner" db:"product_owner"`
	ExpectedCompletionWeek  *string `json:"expectedCompletionWeek" db:"expected_completion_week"`
	CurrentProgress         *string `json:"currentProgress" db:"current_progress"`
	IsCompleted             bool    `json:"isCompleted" db:"is_completed"`
	ProgressNotes           *string `json:"progressNotes" db:"progress_notes"`
	CreatedAt               string  `json:"createdAt" db:"created_at"`
	CreatedBy               *string `json:"createdBy" db:"created_by"`
	UpdatedAt               string  `json:"updatedAt" db:"updated_at"`
	UpdatedBy               *string `json:"updatedBy" db:"updated_by"`
}

// Project 项目模型
type Project struct {
	ID                 string           `json:"id" db:"id"`
	Name               string           `json:"name" db:"name"`
	Priority           string           `json:"priority" db:"priority"`
	BusinessProblem    *string          `json:"businessProblem" db:"business_problem"`
	KeyResultIds       []string         `json:"keyResultIds" db:"key_result_ids"`
	WeeklyUpdate       *string          `json:"weeklyUpdate" db:"weekly_update"`
	LastWeekUpdate     *string          `json:"lastWeekUpdate" db:"last_week_update"`
	Status             string           `json:"status" db:"status"`
	ProductManagers    Role             `json:"productManagers" db:"product_managers"`
	BackendDevelopers  Role             `json:"backendDevelopers" db:"backend_developers"`
	FrontendDevelopers Role             `json:"frontendDevelopers" db:"frontend_developers"`
	QaTesters          Role             `json:"qaTesters" db:"qa_testers"`
	ProposalDate       *string          `json:"proposedDate" db:"proposal_date"`
	LaunchDate         *string          `json:"launchDate" db:"launch_date"`
	CreatedAt          string           `json:"createdAt" db:"created_at"`
	Followers          []string         `json:"followers" db:"followers"`
	Comments           []Comment        `json:"comments" db:"comments"`
	ChangeLog          []ChangeLogEntry `json:"changeLog" db:"change_log"`
	Documents          []Document       `json:"documents" db:"documents"`
}

// EmployeeResponse 员工接口响应
type EmployeeResponse struct {
	EmployeeList map[string][]Employee `json:"employee_list"`
}

// Employee 员工信息
type Employee struct {
	RealName   string `json:"real_name"`
	EmployeeID int    `json:"employee_id"`
	Email      string `json:"email"`
	DeptID     int    `json:"dept_id"`
}

// JSONB 自定义类型，用于处理PostgreSQL的JSONB字段
type JSONB []byte

func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	switch s := value.(type) {
	case string:
		*j = []byte(s)
	case []byte:
		*j = s
	default:
		return errors.New("cannot scan into JSONB")
	}
	return nil
}

// MarshalJSON 实现JSON序列化
func (j JSONB) MarshalJSON() ([]byte, error) {
	if j == nil {
		return []byte("null"), nil
	}
	return j, nil
}

// UnmarshalJSON 实现JSON反序列化
func (j *JSONB) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("JSONB: UnmarshalJSON on nil pointer")
	}
	*j = append((*j)[0:0], data...)
	return nil
}

// StringArray 自定义类型，用于处理PostgreSQL的TEXT[]字段
type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	return "{" + joinStrings(a, ",") + "}", nil
}

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}
	switch s := value.(type) {
	case string:
		// 解析PostgreSQL数组格式 {item1,item2,item3}
		if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
			return errors.New("invalid array format")
		}
		content := s[1 : len(s)-1]
		if content == "" {
			*a = []string{}
			return nil
		}
		*a = splitString(content, ",")
	case []byte:
		return a.Scan(string(s))
	default:
		return errors.New("cannot scan into StringArray")
	}
	return nil
}

// 辅助函数
func joinStrings(arr []string, sep string) string {
	if len(arr) == 0 {
		return ""
	}
	result := arr[0]
	for i := 1; i < len(arr); i++ {
		result += sep + arr[i]
	}
	return result
}

func splitString(s, sep string) []string {
	if s == "" {
		return []string{}
	}
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
			i += len(sep) - 1
		}
	}
	result = append(result, s[start:])
	return result
}
