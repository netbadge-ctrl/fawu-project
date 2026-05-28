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

const weeklySystemPrompt = `你是资深项目管理专家 + 部门周报主笔。基于结构化 JSON 输入，产出逻辑严谨、事实准确、信息密度高的中文周报纯文本段落。

【核心规则，必须严格遵守】
1. 按输入 okrs[].order 升序组织；同一 O 下按 key_results[].order 升序。一个 O 下所有 KR 写完再进入下一个 O。
2. 同一 KR 下多个项目先按 system 归属系统分组（同系统项目写在一起），再按 status 排序（进行中 > 规划中 > 暂停 > 已上线 > 已取消），组内按 priority 高→低、再按 name 字母序。
3. 【最核心规则 - 增量对比】每个项目的叙述必须基于 weekly_update 与 last_week_update 的语义对比，仅输出较上周有实质性新进展的内容：
   - 你需要深入理解两段文字的语义，而非简单的字符串差异比较。
   - 判断"有进展"的标准：出现新的里程碑达成（如完成评审、进入联调、上线）、新的问题/阻塞被发现或解决、阶段性推进（如从设计到开发）、量化指标变化等。
   - 若 weekly_update 相比 last_week_update 有实质新内容 → 仅叙述本周新增的增量进展（2-4句），不重复上周已有的信息。
   - 若 weekly_update 与 last_week_update 语义实质相同（关键里程碑无推进、描述内容无变化）→ 该项目仅输出一句：【项目名】无进展。
   - 若 last_week_update 为空（新项目）→ 正常叙述 weekly_update 全部内容。
4. 每个项目的进展叙述还需融合：status 定性当前阶段 / schedule_text 是否有延期风险。weekly_update 是纯文本，直接引用其语义即可，禁止输出任何 HTML 标签或 CSS 样式代码。
5. 若 is_driving_only=true（项目进行中，推进型项目，不需开发），忽略 schedule_text，只总结本周推进情况与阻塞（同样需对比上周，仅输出增量）。
6. 每个有进展的项目 2–4 句，不分点不表格。项目名必须与输入 name 完全一致，不缩写不翻译。禁止寒暄、禁止编造未出现的数字/日期/人名。

【输出格式 —— 纯文本，禁止 Markdown】
- 禁止使用任何 Markdown 标记（## ### ** __ - 等），输出纯文本。
- 每个 Objective 段落开头格式："{index}. {Objective}"，独占一行。
- 每个 KR 开头格式："{index}.{kr_index} {KrDesc}"，独占一行。
- 同一 KR 下的不同项目必须换行展示，每个项目独占一段（之间空一行），禁止将多个项目挤在同一段落中。
- 项目名用【】包裹，如【项目A】。不使用代码块、引用块、emoji。
- 段落之间用空行分隔，单个 O 段落总字数 300~800 字。`

// ---------- 对外主函数 ----------

// GenerateWeeklySummary 按 OKR 分批调用 LLM 生成周报全文。
// 任意 OKR 调用失败不会中断整体，会在对应段落写占位文本。
func GenerateWeeklySummary(in WeeklyReportInput) (string, error) {
	log.Printf("[WeeklyAI] GenerateWeeklySummary start, year=%d week=%d okrs=%d urgent=%d idle=%d",
		in.WeekRange.Year, in.WeekRange.WeekNumber, len(in.Okrs), len(in.UrgentProjects), len(in.IdleMembers))
	var out strings.Builder
	out.WriteString(fmt.Sprintf("第 %d 周周报（%s ~ %s）\n\n", in.WeekRange.WeekNumber, in.WeekRange.Start, in.WeekRange.End))

	// 规则 1：按 Order 升序逐个 OKR 调 LLM
	for i, okr := range in.Okrs {
		userPrompt := buildOkrUserPrompt(i+1, okr, in.WeekRange)
		part, err := callGLM(weeklySystemPrompt, userPrompt, 0.4, 32000)
		if err != nil {
			log.Printf("[WeeklyAI] OKR %d (%s) failed: %v", i+1, okr.Objective, err)
			out.WriteString(fmt.Sprintf("%d. %s\n\n（本节 AI 生成失败，请手动编辑补充。）\n\n", i+1, okr.Objective))
			continue
		}
		trimmed := strings.TrimSpace(part)
		log.Printf("[WeeklyAI] OKR %d (%s) ok, content len=%d", i+1, okr.Objective, len(trimmed))
		if trimmed == "" {
			log.Printf("[WeeklyAI] OKR %d (%s) returned empty content, using placeholder", i+1, okr.Objective)
			out.WriteString(fmt.Sprintf("%d. %s\n\n（本节 AI 返回为空，请手动编辑补充。）\n\n", i+1, okr.Objective))
			continue
		}
		out.WriteString(trimmed)
		out.WriteString("\n\n")
	}

	// 临时重要需求板块（未关联 KR）
	if len(in.UrgentProjects) > 0 {
		userPrompt := buildUrgentUserPrompt(in.UrgentProjects, in.WeekRange)
		part, err := callGLM(weeklySystemPrompt, userPrompt, 0.4, 16000)
		if err != nil {
			log.Printf("[WeeklyAI] urgent projects failed: %v", err)
			out.WriteString("临时重要需求 / 其他推进事项\n\n（本节 AI 生成失败，请手动编辑补充。）\n\n")
		} else {
			out.WriteString(strings.TrimSpace(part))
			out.WriteString("\n\n")
		}
	}

	// 末尾排期空闲人员板块（确定性列表，不过 LLM）
	out.WriteString(buildIdleSection(in.IdleMembers))

	return out.String(), nil
}

// ensureAlertsAppended 后处理兜底：扫描每个项目段落，检查 MemberAlerts 是否已在段落里出现；
// 若缺失，则在该项目所在段落末尾硬追加 ⚠️ 行。
// 定位策略：以项目 name 首次出现为起点，到下一个空行或文末。
func ensureAlertsAppended(markdown string, okrs []OkrInput, urgent []ProjectInput) string {
	if markdown == "" {
		return markdown
	}
	all := []ProjectInput{}
	for _, o := range okrs {
		for _, kr := range o.KrItems {
			all = append(all, kr.Projects...)
		}
	}
	all = append(all, urgent...)

	for _, p := range all {
		if len(p.MemberAlerts) == 0 {
			continue
		}
		idx := strings.Index(markdown, p.Name)
		if idx < 0 {
			continue
		}
		tail := markdown[idx:]
		endRel := findNextParaBreak(tail)
		segment := tail[:endRel]
		missing := []string{}
		for _, al := range p.MemberAlerts {
			if !strings.Contains(segment, al) {
				missing = append(missing, al)
			}
		}
		if len(missing) == 0 {
			continue
		}
		injection := "\n" + strings.Join(missing, "\n")
		markdown = markdown[:idx+endRel] + injection + markdown[idx+endRel:]
	}
	return markdown
}

// findNextParaBreak 在 s 中找下一个空行（"\n\n"）位置；找不到返回 len(s)。
func findNextParaBreak(s string) int {
	if i := strings.Index(s, "\n\n"); i >= 0 {
		return i
	}
	return len(s)
}

// ---------- Prompt 构造 ----------

func buildOkrUserPrompt(index int, okr OkrInput, wr WeekRange) string {
	payload := map[string]interface{}{
		"week_range":   wr,
		"section_no":   index,
		"okr":          okr,
		"instructions": fmt.Sprintf("请严格按规则输出第 %d 个 OKR 对应段落，从 '%d. %s' 开始，纯文本格式，禁止使用 Markdown。", index, index, okr.Objective),
	}
	raw, _ := json.MarshalIndent(payload, "", "  ")
	return "以下是当前 OKR 的完整数据（JSON），请按系统提示词中的规则产出对应段落：\n\n```json\n" + string(raw) + "\n```"
}

func buildUrgentUserPrompt(projects []ProjectInput, wr WeekRange) string {
	payload := map[string]interface{}{
		"week_range":   wr,
		"projects":     projects,
		"instructions": "请以 '临时重要需求 / 其他推进事项' 作为段落标题，纯文本格式，禁止使用 Markdown，按规则 2（按 system 分组+status 排序）组织，2-4 句话一条项目。",
	}
	raw, _ := json.MarshalIndent(payload, "", "  ")
	return "以下是本周未关联任何 KR 的临时重要需求项目（JSON），请产出对应段落：\n\n```json\n" + string(raw) + "\n```"
}

func buildIdleSection(members []IdleMember) string {
	var sb strings.Builder
	sb.WriteString("本周排期空闲人员\n\n")
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

// callGLMOnce 单次调用 GLM API，返回原始 content。
func callGLMOnce(systemPrompt, userPrompt string, temperature float64, maxTokens int) (string, error) {
	reqBody := map[string]interface{}{
		"model": glmModel,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature": temperature,
		"max_tokens":  maxTokens,
		// 尝试关闭推理模型的思维链输出，使模型直接输出最终正文。
		// GLM-5 系列接受 thinking.type=disabled；不支持该参数的网关会忽略，无副作用。
		"thinking": map[string]string{"type": "disabled"},
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

	rawBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Choices []struct {
			Message struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(rawBody, &result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("GLM no choices")
	}
	ch := result.Choices[0]
	content := strings.TrimSpace(ch.Message.Content)
	if content == "" {
		// content 空时，回退使用 reasoning_content（部分模型把正文放在 reasoning 字段）
		if rc := strings.TrimSpace(ch.Message.ReasoningContent); rc != "" {
			log.Printf("[WeeklyAI] callGLM content empty, fallback to reasoning_content len=%d, finish=%s, completion_tokens=%d",
				len(rc), ch.FinishReason, result.Usage.CompletionTokens)
			return rc, nil
		}
		// 仍为空：打印响应前 800 字节便于排查
		preview := string(rawBody)
		if len(preview) > 800 {
			preview = preview[:800]
		}
		log.Printf("[WeeklyAI] callGLM 200 OK but content empty, finish=%s, completion_tokens=%d, prompt_len=%d, body_preview=%s",
			ch.FinishReason, result.Usage.CompletionTokens, len(userPrompt), preview)
	}
	return content, nil
}

// callGLM 调用 GLM API，若返回空内容则自动重试（最多 2 次），每次重试略微提高 temperature 以获得不同结果。
func callGLM(systemPrompt, userPrompt string, temperature float64, maxTokens int) (string, error) {
	const maxRetries = 2
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		temp := temperature
		if attempt > 0 {
			temp = temperature + float64(attempt)*0.1 // 重试时略微提高 temperature
			log.Printf("[WeeklyAI] callGLM retry %d/%d with temperature=%.2f", attempt, maxRetries, temp)
			time.Sleep(time.Duration(attempt*2) * time.Second) // 简单退避
		}
		content, err := callGLMOnce(systemPrompt, userPrompt, temp, maxTokens)
		if err != nil {
			lastErr = err
			log.Printf("[WeeklyAI] callGLM attempt %d failed: %v", attempt, err)
			continue
		}
		if content != "" {
			return content, nil
		}
		// content 为空，重试
		lastErr = fmt.Errorf("GLM returned empty content")
		log.Printf("[WeeklyAI] callGLM attempt %d returned empty, will retry", attempt)
	}
	// 所有重试都失败
	return "", fmt.Errorf("callGLM failed after %d retries: %v", maxRetries+1, lastErr)
}

