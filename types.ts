// A global user pool
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  deptId: number;
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
  system?: string; // 系统属性
  priority: Priority;
  businessProblem: string;
  keyResultIds: string[];
  weeklyUpdate: string;
  lastWeekUpdate: string;
  status: ProjectStatus;
  productManagers: Role;
  backendDevelopers: Role;
  frontendDevelopers: Role;
  qaTesters: Role;
  proposedDate: string | null;
  launchDate: string | null;
  createdAt: string; // 项目创建时间
  followers: string[];
  comments: Comment[];
  changeLog: ChangeLogEntry[];
  documents: Document[]; // 项目文档列表
  isNew?: boolean;
}

export type ProjectRoleKey = keyof Pick<Project, 'productManagers' | 'backendDevelopers' | 'frontendDevelopers' | 'qaTesters'>;

// 产品月会接口
export interface MonthlyWorkItem {
  id: string;
  year: number;
  month: number;
  workContent: string;                    // 工作内容
  businessProblem?: string;               // 解决的业务问题
  direction?: '业务平台' | '基础平台';        // 方向
  productOwner?: string;                  // 负责产品
  expectedCompletionWeek?: '第一周' | '第二周' | '第三周' | '第四周';  // 预计需求完成时间
  currentProgress?: string;               // 当前产品进展
  isCompleted: boolean;                   // 是否完成
  progressNotes?: string;                 // 进展说明
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}