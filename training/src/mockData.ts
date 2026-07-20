import type { TrainingPlanDashboardData } from './types';
export const mockDashboard: TrainingPlanDashboardData = {
  breadcrumb: ['RUNNER PLANNER', 'ACTIVE PLAN', '長跑重建'], planName: '半馬 21K', weekLabel: '第 3 / 22 週・長跑重建',
  progress: { current: 3, total: 22, percentage: 14, label: '計畫進度' },
  metrics: [
    { label: '賽事日', value: '2026-12-06', detail: '距離目標日 139 天・目標配速 6:24/km' },
    { label: '當週處方', value: '32 km', detail: '正式課表總跑量' },
    { label: '本週輕鬆跑配速', value: '8:37/km', detail: '守 Z2 HR≤150 為主・依最近同心率實跑校準' },
  ],
  workout: { dateLabel: 'TODAY・週一 07-20', sourceLabel: '教練課表', title: '輕鬆跑｜有氧基礎', subtitle: '以舒服、可對話的強度完成，優先照顧恢復品質。', weather: { summary: '預報 32°C・清晨 25%／傍晚 76%（全天最高 100%）', advisory: '建議清晨出發，避開午後陣雨' }, blocks: [
    { label: '主課', detail: 'E 跑 7 km・守 Z2（HR≤150）為主；同心率參考配速 8:00–8:20', emphasis: 'main' }, { label: '熱身', detail: '5–8 分', emphasis: 'support' }, { label: '收操', detail: '5–8 分', emphasis: 'support' },
  ] },
  copy: { progressSummary: '已完成前兩週基礎建立。保持輕鬆跑強度，讓身體穩定累積長跑能力。', apiNotice: '課表資料目前使用 Mock adapter，已保留 API 替換介面。', tabs: { coach: '📌 教練課表', schedule: '訓練日程' }, moreLabel: '更多課表操作', moreItems: [{ label: '查看歷程', href: '#plan-history' }, { label: '課表設定', href: '#settings' }], todayAction: '查看今日課表' },
};
