// A global user pool
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  deptId?: number;
  deptName: string;
}

// 单个时段配置
export interface TimeSlot {
  id: string;
  startDate: string;
  endDate: string;
  description?: string; // 时段描述，如"第一阶段"、"维护期"等
}

// A team member is a user with multiple time slots for a project
export interface TeamMember {
  userId: string;
  timeSlots: TimeSlot[];
  useSharedSchedule?: boolean;
  // 兼容性字段，用于向后兼容
  startDate?: string;
  endDate?: string;
}

// Each role is an array of team members
export type Role = TeamMember[];

export enum ProjectStatus {
  NotStarted = '未开始',
  Discussion = '讨论中',
  ProductDesign = '产品设计',
  RequirementsDone = '需求完成',
  ReviewDone = '评审完成',
  InProgress = '开发中',
  DevDone = '开发完成',
  Testing = '测试中',
  TestDone = '测试完成',
  LaunchedThisWeek = '本周已上线',
  Completed = '已完成',
  Paused = '暂停',
  ProjectInProgress = '项目进行中',
}

export enum Priority {
    DeptOKR = '部门OKR',
    PersonalOKR = '个人OKR',
    UrgentRequirement = '临时重要需求',
    Routine = '日常需求',
    LowPriority = '不重要的需求',
}

export interface KeyResult {
  id: string;          // 复合ID格式：okrId::krSequence，确保全局唯一性
  sequence?: string;   // 原始序列号，如 "kr1", "kr2"（可选，用于向后兼容）
  description: string;
}

export interface OKR {
  id:string;
  objective: string;
  keyResults: KeyResult[];
}

export interface OkrSet {
  periodId: string; // e.g., "2025-H2"
  periodName: string; // e.g., "2025下半年"
  okrs: OKR[];
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  mentions?: string[];
  readBy?: string[]; // 已读用户ID列表
}

export interface ChangeLogEntry {
  id: string;
  userId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

export interface Document {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  createdBy: string;
}

export interface Project {
  id: string;
  name: string;
  businessDirection?: string;
  priority: Priority;
  businessBackground: string;
  keyResultIds: string[];
  weeklyUpdate: string;
  lastWeekUpdate: string;
  status: ProjectStatus;
  owners: Role[];
  proposedDate: string | null;
  completionDate: string | null;
  createdAt: string; // 项目创建时间
  followers: string[];
  comments: Comment[];
  changeLog: ChangeLogEntry[];
  documents: Document[]; // 项目文档列表
  isNew?: boolean;
}

export type ProjectRoleKey = 'owners';

// AI研究任务接口
export interface AIResearchTask {
  id: string;
  title: string;                          // 研究主题 / 任务名称
  background?: string;                    // 研究背景与目标
  status?: '调研中' | '实验中' | '验证中' | '已完成' | '已暂停';  // 当前状态
  owner?: string;                         // 负责人
  expectedOutput?: '调研报告' | 'Prompt 模板' | '原型' | '上线方案' | '其他';  // 预期产出
  progress?: string;                      // 当前进展 / 关键结论
  blockers?: string;                      // 阻塞项 / 依赖
  plannedCompletionDate?: string;         // 计划完成时间
  notes?: string;                         // 备注
  isCompleted: boolean;                   // 是否完成
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}