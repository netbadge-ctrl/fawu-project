// 系统配置常量 - 数据由后端API提供，此文件仅保留前端配置

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
