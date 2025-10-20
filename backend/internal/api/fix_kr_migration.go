package api

import (
	"encoding/json"
	"net/http"

	"project-management-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

// 重新初始化OKR数据，使用正确的复合KR ID格式
func (h *Handler) ReinitializeOkrData(c *gin.Context) {
	// 1. 清空现有数据
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	// 清空OKR数据
	_, err = tx.Exec("DELETE FROM okr_sets")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear OKR sets: " + err.Error()})
		return
	}

	// 清空项目的KR关联
	_, err = tx.Exec("UPDATE projects SET key_result_ids = $1", "{}")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear project KR associations: " + err.Error()})
		return
	}

	// 2. 创建新的OKR数据，使用正确的复合ID格式
	okrSets := []models.OkrSet{
		{
			PeriodID:   "2025-H2",
			PeriodName: "2025下半年",
			Okrs: []models.OKR{
				{
					ID:        "o1",
					Objective: "通过平台化建设，提升项目需求交付质量及效率",
					KeyResults: []models.KeyResult{
						{ID: "o1::kr1", Sequence: "kr1", Description: "机柜规划线上化、自动化支持，机架位信息准确性提升至99.9%"},
						{ID: "o1::kr2", Sequence: "kr2", Description: "通过系统化支持，服务器改配准确率提升至99.9%（2024 年基准 98.37%）"},
						{ID: "o1::kr3", Sequence: "kr3", Description: "9月底实现GPU项目损益测算线上化和财务BP并行测算；10月底实现GPU项目损益测算自动化，单项目测算工作时长由2天缩短至0.5天级"},
						{ID: "o1::kr4", Sequence: "kr4", Description: "实现裸金属服务器SSD盘按model管理，改配需求对SSD盘的性能要求100%满足"},
					},
				},
				{
					ID:        "o2",
					Objective: "为业务提供风险管控能力，助力业务健康发展",
					KeyResults: []models.KeyResult{
						{ID: "o2::kr1", Sequence: "kr1", Description: "提升计收风险控制能力，账单调整金额较24年下降30%"},
						{ID: "o2::kr2", Sequence: "kr2", Description: "降低账单、资产相关系统合规风险，确保审计范围内系统ITGC重大及重要缺陷为0"},
						{ID: "o2::kr3", Sequence: "kr3", Description: "配合管局做IP备案准确性治理，公有云范围内ip备案准确性不低于90%"},
					},
				},
				{
					ID:        "o3",
					Objective: "补齐网络变更能力，增强网络交付能力，实现网络运维系统成熟度跃升",
					KeyResults: []models.KeyResult{
						{ID: "o3::kr1", Sequence: "kr1", Description: "构建网络变更平台,通过平台执行操作达到80%,并网场景具备一键回滚能力"},
						{ID: "o3::kr2", Sequence: "kr2", Description: "通过预部署等方式提升基础网络全流程交付效率，通过预部署方案上线TOR数量占比40%"},
						{ID: "o3::kr3", Sequence: "kr3", Description: "变更哨兵场景覆盖率不小于80%（尤其是各种Core设备、云网络gsw设备、DP设备等爆炸半径较大或直接影响客户体验的），采集周期1s级，反应时间5s级"},
						{ID: "o3::kr4", Sequence: "kr4", Description: "支持ROCE交换机集群网络NQA能力"},
						{ID: "o3::kr5", Sequence: "kr5", Description: "按需支持故障止损平台，一期上线多发故障场景止损用例2个（公网自动化调度、RoCE快速隔离或GSW快速隔离等），止损时间控制在30分钟内（挑战目标15分钟）"},
					},
				},
				{
					ID:        "o4",
					Objective: "内部服务及控制台产品力和体验提升",
					KeyResults: []models.KeyResult{
						{ID: "o4::kr1", Sequence: "kr1", Description: "大客户产品需求按期满足率不低于92%"},
						{ID: "o4::kr2", Sequence: "kr2", Description: "服务质量分数提升33%（64分->77+）"},
						{ID: "o4::kr3", Sequence: "kr3", Description: "持续优化官网控制台静态资源和接口数据，年底时前端网页加载效率提升30%以上"},
						{ID: "o4::kr4", Sequence: "kr4", Description: "云顾问、企业账号中心、IAM、资源中心几个核心控制台服务，功能覆盖率由44%提升至69%（对标腾讯云）"},
						{ID: "o4::kr5", Sequence: "kr5", Description: "调研客户试用到退订的卡点问题并解决，问题解决率不低于90%"},
					},
				},
				{
					ID:        "o5",
					Objective: "提升团队整体技术氛围，打造更有战斗力的团队",
					KeyResults: []models.KeyResult{
						{ID: "o5::kr1", Sequence: "kr1", Description: "服务链路能力推广至产品线5个产品的控制台，所接入服务故障根因定位时间缩短至5分钟之内"},
						{ID: "o5::kr2", Sequence: "kr2", Description: "团队完成不低于10次的技术分享，沉淀5篇技术文档/案例至知识库"},
						{ID: "o5::kr3", Sequence: "kr3", Description: "组织1次内部述职，3级leader胜任度答辩，25年倒数10名员工pip答辩"},
						{ID: "o5::kr4", Sequence: "kr4", Description: "利用大模型，结合业务平台接入本地知识库，产品线及销售等角色的日常咨询用AI解决率不低于80%"},
						{ID: "o5::kr5", Sequence: "kr5", Description: "全员利用AI提效，完成不低于5个场景的典型案例"},
					},
				},
			},
		},
	}

	// 3. 插入新的OKR数据
	for _, okrSet := range okrSets {
		okrsJSON, _ := json.Marshal(okrSet.Okrs)
		_, err := tx.Exec(
			"INSERT INTO okr_sets (period_id, period_name, okrs) VALUES ($1, $2, $3)",
			okrSet.PeriodID, okrSet.PeriodName, okrsJSON)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert OKR set: " + err.Error()})
			return
		}
	}

	// 4. 更新示例项目，使用正确的复合KR ID
	sampleProjectUpdates := map[string][]string{
		"p1": {"o1::kr1", "o1::kr2"}, // Q3 用户增长计划
		"p2": {"o4::kr2", "o4::kr3"}, // 移动端性能优化
		"p3": {"o2::kr1"},            // 数据分析平台
		"p4": {"o5::kr2"},            // AI智能客服机器人
		"p5": {"o3::kr1", "o3::kr3"}, // 新用户引导流程优化
	}

	for projectID, krIds := range sampleProjectUpdates {
		// 使用PostgreSQL数组格式
		var krIdsArray []interface{}
		for _, krId := range krIds {
			krIdsArray = append(krIdsArray, krId)
		}

		_, err = tx.Exec(
			"UPDATE projects SET key_result_ids = $1 WHERE id = $2",
			pq.Array(krIds), projectID)
		if err != nil {
			// 项目可能不存在，继续处理其他项目
			continue
		}
	}

	// 5. 提交事务
	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "OKR数据重新初始化成功",
		"okrSetsInitialized": len(okrSets),
		"projectsUpdated":    len(sampleProjectUpdates),
		"note":               "所有KR现在使用复合ID格式（okrId::krSequence），确保全局唯一性",
	})
}
