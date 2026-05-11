// Package ai 提供周报 AI 生成相关能力。
// - 模型：glm-5.1（Kingsoft Cloud 通用大模型网关）
// - 调用策略：按 OKR 分批调用，每个 Objective 独立一次 LLM 请求；
//   * 避免单次 prompt 上下文过大
//   * 单 OKR 失败不影响其它 OKR
//   * 最后一节"排期空闲人员"由后端直接拼接，无需 LLM
package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// ---------- 对外常量 ----------

const (
	glmModel    = "glm-5.1"
	glmEndpoint = "https://kspmas.ksyun.com/v1/chat/completions"
)

// glmAuthHdr 优先取 GLM_AUTH_HEADER 环境变量；未设置时退回到内置默认值以保持向后兼容。
var glmAuthHdr = func() string {
	if v := os.Getenv("GLM_AUTH_HEADER"); v != "" {
		return v
	}
	return "Bearer fce00142-9287-4500-92b6-0baa0ffad576"
}()

// ---------- 对外数据结构 ----------

// WeekRange 本周起止
type WeekRange struct {
	Year       int    `json:"year"`
	WeekNumber int    `json:"week_number"`
	Start      string `json:"start"`
	End        string `json:"end"`
}

// ProjectInput 单项目数据（经过预处理后喂给 LLM 的最小集）
type ProjectInput struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	System          string   `json:"system"`
	Status          string   `json:"status"`
	Priority        string   `json:"priority"`
	BusinessProblem string   `json:"business_problem"`
	WeeklyUpdate    string   `json:"weekly_update"`
	LastWeekUpdate  string   `json:"last_week_update"`
	LaunchDate      string   `json:"launch_date,omitempty"`
	ScheduleText    string   `json:"schedule_text,omitempty"` // "后端: 张三 05.04~05.10"；推进型项目为空
	MemberAlerts    []string `json:"member_alerts,omitempty"` // 排期缺失 > 14 天的提示
	IsDrivingOnly   bool     `json:"is_driving_only"`         // true=项目进行中（推进型，不看研发排期）
}

// KrInput 单个 KR 下的项目集
type KrInput struct {
	KrID     string         `json:"kr_id"`
	KrDesc   string         `json:"kr_desc"`
	Order    int            `json:"order"`
	Projects []ProjectInput `json:"projects"`
}

// OkrInput 单个 Objective 下的完整结构
type OkrInput struct {
	OkrID     string    `json:"okr_id"`
	Objective string    `json:"objective"`
	Order     int       `json:"order"`
	KrItems   []KrInput `json:"key_results"`
}

// IdleMember 排期空闲的人员
type IdleMember struct {
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	IdleDays  int    `json:"idle_days"`
	LastEnd   string `json:"last_scheduled_end,omitempty"`
}

// WeeklyReportInput 完整喂给 AI 的数据
type WeeklyReportInput struct {
	WeekRange      WeekRange      `json:"week_range"`
	Okrs           []OkrInput     `json:"okrs"`
	UrgentProjects []ProjectInput `json:"urgent_projects,omitempty"` // 未关联 KR 的临时重要需求
	IdleMembers    []IdleMember   `json:"idle_members"`
}

// ---------- System Prompt（精炼自 docs/weekly_report_system_prompt.md） ----------

const weeklySystemPrompt = `你是资深项目管理专家 + 部门周报主笔。基于结构化 JSON 输入，产出逻辑严谨、事实准确、信息密度高的中文周报段落。

【核心规则，必须严格遵守】
1. 按输入 okrs[].order 升序组织；同一 O 下按 key_results[].order 升序。一个 O 下所有 KR 写完再进入下一个 O。
2. 同一 KR 下多个项目先按 system 归属系统分组（同系统项目写在一起），再按 status 排序（进行中 > 规划中 > 暂停 > 已上线 > 已取消），组内按 priority 高→低、再按 name 字母序。
3. 每个项目叙述必须融合 4 维：status 定性阶段 / weekly_update 主线 / schedule_text 是否有延期风险 / last_week_update 对比。
4. 若 is_driving_only=true（项目进行中，推进型项目，不需开发），忽略 schedule_text，只总结本周推进情况与阻塞。
5. 对比 weekly_update 与 last_week_update：若文本实质相同（去标点空白后相似度 ≥85% 或关键里程碑未更新），在该项目末尾必须加一句：⚠️ 本周进展与上周基本一致，推进节奏停滞，建议同步具体阻塞。
6. member_alerts 非空时，在该项目末尾原样追加一行 ⚠️ 提示。
7. 每个项目 2–4 句，不分点不表格。项目名必须与输入 name 完全一致，不缩写不翻译。禁止寒暄、禁止编造未出现的数字/日期/人名。

【输出格式】
- 直接以 "## {index}. {Objective}" 开始，不要 H1 标题、不要寒暄引导语。
- 每个 KR 以 "### {index}.{kr_index} {KrDesc}" 开始。
- 允许使用加粗项目名，不使用代码块、引用块、emoji（⚠️ 除外）。
- 单个 O 段落总字数 300~800 字。`

// ---------- 对外主函数 ----------

// GenerateWeeklySummary 按 OKR 分批调用 LLM 生成周报全文。
// 任意 OKR 调用失败不会中断整体，会在对应段落写占位文本。
func GenerateWeeklySummary(in WeeklyReportInput) (string, error) {
	var out strings.Builder
	out.WriteString(fmt.Sprintf("# 第 %d 周周报（%s ~ %s）\n\n", in.WeekRange.WeekNumber, in.WeekRange.Start, in.WeekRange.End))

	// 规则 1：按 Order 升序逐个 OKR 调 LLM
	for i, okr := range in.Okrs {
		userPrompt := buildOkrUserPrompt(i+1, okr, in.WeekRange)
		part, err := callGLM(weeklySystemPrompt, userPrompt, 0.4, 2000)
		if err != nil {
			log.Printf("[WeeklyAI] OKR %d (%s) failed: %v", i+1, okr.Objective, err)
			out.WriteString(fmt.Sprintf("## %d. %s\n\n（本节 AI 生成失败，请手动编辑补充。）\n\n", i+1, okr.Objective))
			continue
		}
		out.WriteString(strings.TrimSpace(part))
		out.WriteString("\n\n")
	}

	// 临时重要需求板块（未关联 KR）
	if len(in.UrgentProjects) > 0 {
		userPrompt := buildUrgentUserPrompt(in.UrgentProjects, in.WeekRange)
		part, err := callGLM(weeklySystemPrompt, userPrompt, 0.4, 1200)
		if err != nil {
			log.Printf("[WeeklyAI] urgent projects failed: %v", err)
			out.WriteString("## 临时重要需求 / 其他推进事项\n\n（本节 AI 生成失败，请手动编辑补充。）\n\n")
		} else {
			out.WriteString(strings.TrimSpace(part))
			out.WriteString("\n\n")
		}
	}

	// 规则 7：末尾排期空闲人员板块（确定性列表，不过 LLM）
	out.WriteString(buildIdleSection(in.IdleMembers))

	return out.String(), nil
}

// ---------- Prompt 构造 ----------

func buildOkrUserPrompt(index int, okr OkrInput, wr WeekRange) string {
	payload := map[string]interface{}{
		"week_range":   wr,
		"section_no":   index,
		"okr":          okr,
		"instructions": fmt.Sprintf("请严格按规则输出第 %d 个 OKR 对应段落，从 '## %d. %s' 开始。", index, index, okr.Objective),
	}
	raw, _ := json.MarshalIndent(payload, "", "  ")
	return "以下是当前 OKR 的完整数据（JSON），请按系统提示词中的规则产出对应段落：\n\n```json\n" + string(raw) + "\n```"
}

func buildUrgentUserPrompt(projects []ProjectInput, wr WeekRange) string {
	payload := map[string]interface{}{
		"week_range":   wr,
		"projects":     projects,
		"instructions": "请以 '## 临时重要需求 / 其他推进事项' 作为段落标题，按系统提示词中规则 2（按 system 分组+status 排序）组织，2-4 句话一条项目。",
	}
	raw, _ := json.MarshalIndent(payload, "", "  ")
	return "以下是本周未关联任何 KR 的临时重要需求项目（JSON），请产出对应段落：\n\n```json\n" + string(raw) + "\n```"
}

func buildIdleSection(members []IdleMember) string {
	var sb strings.Builder
	sb.WriteString("## 本周排期空闲人员\n\n")
	if len(members) == 0 {
		sb.WriteString("本周全员均有排期，无空闲资源。\n")
		return sb.String()
	}
	for _, m := range members {
		role := m.Role
		if role == "" {
			role = "角色未填"
		}
		if m.LastEnd != "" {
			sb.WriteString(fmt.Sprintf("- %s（%s，上次排期截至 %s，已空闲 %d 天）\n", m.Name, role, m.LastEnd, m.IdleDays))
		} else {
			sb.WriteString(fmt.Sprintf("- %s（%s，从未排入项目）\n", m.Name, role))
		}
	}
	return sb.String()
}

// ---------- 底层 HTTP 调用 ----------

func callGLM(systemPrompt, userPrompt string, temperature float64, maxTokens int) (string, error) {
	reqBody := map[string]interface{}{
		"model": glmModel,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature": temperature,
		"max_tokens":  maxTokens,
	}
	body, _ := json.Marshal(reqBody)

	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequest("POST", glmEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", glmAuthHdr)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GLM status=%d body=%s", resp.StatusCode, string(b))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("GLM no choices")
	}
	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

