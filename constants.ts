import { Project, User, ProjectStatus, OKR, Priority, OkrSet } from './types';

const employeeData = [
    { "real_name": "陈雨", "employee_id": 20416 },
    { "real_name": "周广瑞", "employee_id": 14670 },
    { "real_name": "陈楠", "employee_id": 22231 },
    { "real_name": "陈绪绍", "employee_id": 21614 },
    { "real_name": "黄胜", "employee_id": 25408 },
    { "real_name": "陈一奇", "employee_id": 25798 },
    { "real_name": "钟望", "employee_id": 20810 },
    { "real_name": "吴丽星", "employee_id": 24665 },
    { "real_name": "杨鹏飞", "employee_id": 24533 },
    { "real_name": "阿拉木斯", "employee_id": 20843 },
    { "real_name": "段俊其", "employee_id": 30515 },
    { "real_name": "刘会成", "employee_id": 31422 },
    { "real_name": "翁鑫", "employee_id": 31765 },
    { "real_name": "文强", "employee_id": 32226 },
    { "real_name": "刘丽娟", "employee_id": 32880 },
    { "real_name": "靳庆康", "employee_id": 32987 },
    { "real_name": "张萌莉", "employee_id": 33132 },
    { "real_name": "王诗聪", "employee_id": 34799 },
    { "real_name": "杨泽超", "employee_id": 35241 },
    { "real_name": "刘洪兴", "employee_id": 35634 },
    { "real_name": "赵琪", "employee_id": 36434 },
    { "real_name": "田庆立", "employee_id": 37703 },
    { "real_name": "张云霞", "employee_id": 37766 },
    { "real_name": "仉晓甜", "employee_id": 38996 },
    { "real_name": "陈丽丽", "employee_id": 39063 },
    { "real_name": "张志强", "employee_id": 39285 },
    { "real_name": "孙新强", "employee_id": 39836 },
    { "real_name": "彭涛", "employee_id": 40287 },
    { "real_name": "乔振华", "employee_id": 41896 },
    { "real_name": "张晓", "employee_id": 43171 },
    { "real_name": "魏靖人", "employee_id": 43579 },
    { "real_name": "武文煜", "employee_id": 43581 },
    { "real_name": "冯一锴", "employee_id": 45585 },
    { "real_name": "王彧", "employee_id": 47247 },
    { "real_name": "王彬", "employee_id": 90629 },
    { "real_name": "王路路", "employee_id": 48766 },
    { "real_name": "王浩瀚", "employee_id": 90727 },
    { "real_name": "裴帅康", "employee_id": 44531 },
    { "real_name": "胡恒", "employee_id": 91182 },
    { "real_name": "李亚楠", "employee_id": 91196 },
    { "real_name": "李立", "employee_id": 53194 },
    { "real_name": "刘越", "employee_id": 53200 },
    { "real_name": "刘雨明", "employee_id": 54558 },
    { "real_name": "贾云婷", "employee_id": 54546 },
    { "real_name": "刘澧", "employee_id": 54431 },
    { "real_name": "张顺", "employee_id": 54460 },
    { "real_name": "王思进", "employee_id": 55030 },
    { "real_name": "叶裕锋", "employee_id": 56129 },
    { "real_name": "周盟", "employee_id": 56127 },
    { "real_name": "孙鑫鑫", "employee_id": 56854 },
    { "real_name": "关硕", "employee_id": 58668 },
    { "real_name": "彭伟", "employee_id": 58794 },
    { "real_name": "徐斌斌", "employee_id": 10000368 },
    { "real_name": "祁云龙", "employee_id": 10000377 },
    { "real_name": "孙鹤轩", "employee_id": 59324 },
    { "real_name": "牛嘉诚", "employee_id": 59932 },
    { "real_name": "蔺子豪", "employee_id": 59976 },
    { "real_name": "李星辰", "employee_id": 59969 },
    { "real_name": "宋楠", "employee_id": 60701 },
    { "real_name": "兰义丰", "employee_id": 61001 },
    { "real_name": "黄测寓", "employee_id": 63463 },
    { "real_name": "吴鹏", "employee_id": 10000474 }
];

export const ALL_USERS: User[] = employeeData.map(employee => ({
  id: String(employee.employee_id),
  name: employee.real_name,
  email: `${employee.real_name.toLowerCase()}@company.com`,
  avatarUrl: `https://picsum.photos/seed/${employee.employee_id}/40/40`,
}));


const INITIAL_OKRS: OKR[] = [
  {
    id: 'okr1',
    objective: '实现季度新用户增长30%，提升应用商店排名至前十。',
    keyResults: [
      { id: 'kr1_1', description: '完成3次线上市场推广活动' },
      { id: 'kr1_2', description: '应用商店评分提升至4.8分' },
    ],
  },
  {
    id: 'okr2',
    objective: '将支付成功率提升至99.5%，减少支付流程平均时长50%。',
    keyResults: [
      { id: 'kr2_1', description: '重构支付网关，减少技术故障率90%' },
      { id: 'kr2_2', description: '优化前端支付交互，减少用户操作步骤' },
    ],
  },
  {
    id: 'okr3',
    objective: '新版后台上线，提升运营人员日均操作效率40%。',
    keyResults: [
      { id: 'kr3_1', description: '收集运营团队反馈，完成10项核心功能优化' },
      { id: 'kr3_2', description: '新后台系统Bug率低于0.1%' },
    ],
  },
];

export const OKR_SETS: OkrSet[] = [
  {
    periodId: '2025-H2',
    periodName: '2025下半年',
    okrs: INITIAL_OKRS,
  },
];

const today = new Date();
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


export const PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Q3 用户增长计划',
    priority: Priority.DeptOKR,
    businessProblem: '新用户注册率增长放缓，需要提升品牌曝光度和转化率。',
    keyResultIds: ['kr1_1', 'kr1_2'],
    weeklyUpdate: '市场活动已启动，网红合作细节敲定中。',
    lastWeekUpdate: '<div>确定了市场推广的核心主题和预算。</div>',
    status: ProjectStatus.InProgress,
    productManagers: [
      { userId: '20416', startDate: formatDate(addDays(today, -45)), endDate: formatDate(addDays(today, 30)) },
    ],
    backendDevelopers: [
      { userId: '21614', startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, 15)) },
    ],
    frontendDevelopers: [
      { userId: '25408', startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, 20)) },
    ],
    qaTesters: [
      { userId: '24533', startDate: formatDate(today), endDate: formatDate(addDays(today, 30)) },
    ],
    proposedDate: formatDate(addDays(today, -60)),
    launchDate: formatDate(addDays(today, 30)),
    followers: ['14670', '22231'],
    comments: [
      { id: 'c1-1', userId: '14670', text: '这个项目很重要，@陈楠 大家加油！', createdAt: '2024-07-20T10:00:00Z', mentions: ['22231'] },
      { id: 'c1-2', userId: '20416', text: '收到，后端进度正常，下周可以联调。', createdAt: '2024-07-21T11:30:00Z' }
    ],
    changeLog: [
      { id: 'cl1-1', userId: '20416', field: 'status', oldValue: ProjectStatus.Discussion, newValue: ProjectStatus.InProgress, changedAt: '2024-07-19T14:00:00Z' },
      { id: 'cl1-2', userId: '22231', field: 'priority', oldValue: 'P1', newValue: '部门OKR相关', changedAt: '2024-07-18T09:00:00Z' }
    ],
  },
  {
    id: 'p2',
    name: '支付系统重构',
    priority: Priority.DeptOKR,
    businessProblem: '现有支付流程复杂，掉单率高，影响用户体验和收入。',
    keyResultIds: ['kr2_1'],
    weeklyUpdate: '核心架构设计完成，进入编码阶段。',
    lastWeekUpdate: '<div>支付网关选型调研完成。</div>',
    status: ProjectStatus.Launched,
    productManagers: [
      { userId: '14670', startDate: formatDate(addDays(today, -90)), endDate: formatDate(addDays(today, -5)) },
    ],
    backendDevelopers: [
      { userId: '25798', startDate: formatDate(addDays(today, -80)), endDate: formatDate(addDays(today, -15)) },
      { userId: '24665', startDate: formatDate(addDays(today, -80)), endDate: formatDate(addDays(today, -10)) },
    ],
    frontendDevelopers: [
      { userId: '20810', startDate: formatDate(addDays(today, -60)), endDate: formatDate(addDays(today, -8)) },
    ],
    qaTesters: [
      { userId: '20843', startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, -6)) },
    ],
    proposedDate: formatDate(addDays(today, -120)),
    launchDate: formatDate(addDays(today, -5)),
    followers: ['20416'],
    comments: [],
    changeLog: [],
  },
  {
    id: 'p3',
    name: '管理后台 V2.0',
    priority: Priority.UrgentRequirement,
    businessProblem: '旧版后台操作繁琐，功能缺失，运营效率低下。',
    keyResultIds: ['kr3_1'],
    weeklyUpdate: '需求评审阶段，部分原型图已出。',
    lastWeekUpdate: '<div>完成了初步的需求收集。</div>',
    status: ProjectStatus.Discussion,
    productManagers: [
      { userId: '22231', startDate: formatDate(today), endDate: formatDate(addDays(today, 60)) },
      { userId: '20416', startDate: formatDate(today), endDate: formatDate(addDays(today, 60)) },
    ],
    backendDevelopers: [],
    frontendDevelopers: [],
    qaTesters: [],
    proposedDate: formatDate(addDays(today, -7)),
    launchDate: formatDate(addDays(today, 90)),
    followers: [],
    comments: [],
    changeLog: [],
  },
  {
    id: 'p4',
    name: 'AI智能客服机器人',
    priority: Priority.PersonalOKR,
    businessProblem: '客服人力成本高，响应速度慢，需要引入AI提升效率和用户满意度。',
    keyResultIds: ['kr3_2'],
    weeklyUpdate: '核心意图识别模块开发完成，准确率达到85%。正在进行多轮对话逻辑的开发。',
    lastWeekUpdate: '<div>确定技术选型，使用RASA框架。</div>',
    status: ProjectStatus.InProgress,
    productManagers: [
      { userId: '22231', startDate: formatDate(addDays(today, -40)), endDate: formatDate(addDays(today, 50)) },
    ],
    backendDevelopers: [
      { userId: '24665', startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, 50)) },
    ],
    frontendDevelopers: [
      { userId: '20810', startDate: formatDate(addDays(today, -20)), endDate: formatDate(addDays(today, 40)) },
    ],
    qaTesters: [
      { userId: '20843', startDate: formatDate(addDays(today, 10)), endDate: formatDate(addDays(today, 50)) },
    ],
    proposedDate: formatDate(addDays(today, -50)),
    launchDate: formatDate(addDays(today, 50)),
    followers: ['20416', '14670'],
    comments: [
      { id: 'c4-1', userId: '20416', text: '这个项目看起来很有挑战，@吴丽星 加油！AI部分是关键。', createdAt: formatDate(addDays(today, -15)) + 'T14:20:00Z', mentions: ['24665'] },
      { id: 'c4-2', userId: '22231', text: '是的，我们正在攻克难关。下周会有一个demo。', createdAt: formatDate(addDays(today, -14)) + 'T09:00:00Z' }
    ],
    changeLog: [
      { id: 'cl4-1', userId: '22231', field: 'status', oldValue: ProjectStatus.Discussion, newValue: ProjectStatus.InProgress, changedAt: formatDate(addDays(today, -30)) + 'T10:00:00Z' }
    ],
  },
  {
    id: 'p5',
    name: '数据中台建设',
    priority: Priority.DeptOKR,
    businessProblem: '各业务线数据孤岛问题严重，数据资产利用率低，决策缺少数据支持。',
    keyResultIds: ['kr2_2'],
    weeklyUpdate: 'ETL流程测试中，发现几个性能瓶颈，正在优化。数据报表前端展示已完成。',
    lastWeekUpdate: '<div>数据仓库模型设计评审通过。</div>',
    status: ProjectStatus.Testing,
    productManagers: [
      { userId: '14670', startDate: formatDate(addDays(today, -100)), endDate: formatDate(addDays(today, 20)) },
    ],
    backendDevelopers: [
      { userId: '21614', startDate: formatDate(addDays(today, -90)), endDate: formatDate(addDays(today, 20)) },
      { userId: '25798', startDate: formatDate(addDays(today, -90)), endDate: formatDate(addDays(today, 20)) },
    ],
    frontendDevelopers: [
      { userId: '24533', startDate: formatDate(addDays(today, -60)), endDate: formatDate(addDays(today, 10)) },
    ],
    qaTesters: [
      { userId: '25408', startDate: formatDate(addDays(today, -20)), endDate: formatDate(addDays(today, 20)) },
    ],
    proposedDate: formatDate(addDays(today, -120)),
    launchDate: formatDate(addDays(today, 20)),
    followers: ['22231', '20810', '20416'],
    comments: [
      { id: 'c5-1', userId: '22231', text: '这个项目非常关键，是公司今年的重点。', createdAt: formatDate(addDays(today, -5)) + 'T11:00:00Z' },
      { id: 'c5-2', userId: '14670', text: '感谢关注！@陈绪绍 @陈一奇 我们会确保数据质量。', createdAt: formatDate(addDays(today, -4)) + 'T18:00:00Z', mentions: ['21614', '25798'] },
      { id: 'c5-3', userId: '21614', text: '收到，正在跟进SQL优化。', createdAt: formatDate(addDays(today, -3)) + 'T19:30:00Z' }
    ],
    changeLog: [],
  },
  {
    id: 'p6',
    name: '官网2024版改版',
    priority: Priority.LowPriority,
    businessProblem: '旧版官网风格陈旧，无法体现公司新品牌形象，且移动端体验差。',
    keyResultIds: ['kr1_2'],
    weeklyUpdate: '后端接口开发完成，前端正在集成。',
    lastWeekUpdate: '<div>完成UI/UX设计稿。</div>',
    status: ProjectStatus.DevDone,
    productManagers: [
      { userId: '20416', startDate: formatDate(addDays(today, -50)), endDate: formatDate(addDays(today, 10)) },
    ],
    backendDevelopers: [
      { userId: '25798', startDate: formatDate(addDays(today, -40)), endDate: formatDate(addDays(today, 0)) },
    ],
    frontendDevelopers: [
      { userId: '25408', startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, 10)) },
    ],
    qaTesters: [
      { userId: '24533', startDate: formatDate(today), endDate: formatDate(addDays(today, 10)) },
    ],
    proposedDate: formatDate(addDays(today, -60)),
    launchDate: formatDate(addDays(today, 10)),
    followers: ['14670', '22231', '21614', '20810', '24665', '20843'],
    comments: [
      { id: 'c6-1', userId: '14670', text: '新设计稿很棒！期待上线效果。', createdAt: formatDate(addDays(today, -25)) + 'T10:00:00Z'},
      { id: 'c6-2', userId: '20416', text: '@黄胜 前端同学加油，争取下周提测！', createdAt: formatDate(addDays(today, -1)) + 'T16:00:00Z', mentions: ['25408'] }
    ],
    changeLog: [],
  },
  {
    id: 'p7',
    name: '测试项目',
    priority: Priority.UrgentRequirement,
    businessProblem: '这是一个用于测试排期时间功能的项目，需要验证日期选择和显示的准确性。',
    keyResultIds: ['kr1_1'],
    weeklyUpdate: '项目排期时间已修正，当前进度正常。',
    lastWeekUpdate: '<div>发现排期时间选择错误，需要从9月4-6号调整为9月3-5号。</div>',
    status: ProjectStatus.InProgress,
    productManagers: [
      { userId: '22231', startDate: '2025-09-03', endDate: '2025-09-05' },
    ],
    backendDevelopers: [
      { userId: '21614', startDate: '2025-09-03', endDate: '2025-09-05' },
    ],
    frontendDevelopers: [
      { userId: '25408', startDate: '2025-09-03', endDate: '2025-09-05' },
    ],
    qaTesters: [
      { userId: '24533', startDate: '2025-09-03', endDate: '2025-09-05' },
    ],
    proposedDate: '2025-09-01',
    launchDate: '2025-09-05',
    followers: ['14670', '20416'],
    comments: [
      { id: 'c7-1', userId: '22231', text: '已修正排期时间：从9月4-6号调整为9月3-5号，符合实际需求。', createdAt: '2025-09-03T10:00:00Z' },
      { id: 'c7-2', userId: '14670', text: '确认排期修正无误，项目可以按计划进行。', createdAt: '2025-09-03T11:00:00Z' }
    ],
    changeLog: [
      { id: 'cl7-1', userId: '22231', field: 'launchDate', oldValue: '2025-09-06', newValue: '2025-09-05', changedAt: '2025-09-03T09:30:00Z' },
      { id: 'cl7-2', userId: '22231', field: 'productManagers', oldValue: '2025-09-04 to 2025-09-06', newValue: '2025-09-03 to 2025-09-05', changedAt: '2025-09-03T09:30:00Z' }
    ],
  }
];

// 系统属性枚举值
export const SYSTEM_OPTIONS = [
  'GPU项目管理',
  'IAM',
  'KSCC',
  'NOC',
  'OMS',
  'VNOC',
  '动环系统',
  '官网相关',
  '价格相关',
  '其它',
  '网管平台',
  '应收相关',
  '账单相关',
  '资产运营平台',
] as const;

export type SystemType = typeof SYSTEM_OPTIONS[number];