export type WorkoutSource = 'schedule' | 'coach';
export interface PlanMetric { label: string; value: string; detail: string; }
export interface WorkoutBlock { label: string; detail: string; emphasis?: 'main' | 'support'; }
export interface Weather { summary: string; advisory: string; }
export interface Workout { dateLabel: string; sourceLabel: string; title: string; subtitle: string; weather: Weather; blocks: WorkoutBlock[]; }
export interface DashboardCopy { progressSummary: string; apiNotice: string; tabs: Record<WorkoutSource, string>; moreLabel: string; moreItems: { label: string; href: string }[]; todayAction: string; }
export interface TrainingPlanDashboardData { breadcrumb: string[]; planName: string; weekLabel: string; progress: { current: number; total: number; percentage: number; label: string }; metrics: PlanMetric[]; workout: Workout; copy: DashboardCopy; }
export interface TrainingPlanApi { getDashboard(signal?: AbortSignal): Promise<TrainingPlanDashboardData | null>; }
