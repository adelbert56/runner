import type { TrainingPlanApi } from './types';
import { mockDashboard } from './mockData';
/** Replace this adapter with the existing training API when the endpoint is ready. */
export const trainingPlanApi: TrainingPlanApi = { async getDashboard(signal) {
  await new Promise<void>((resolve, reject) => { const timer = window.setTimeout(resolve, 420); signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
  const state = new URLSearchParams(window.location.search).get('state'); if (state === 'error') throw new Error('暫時無法載入訓練計畫，請稍後再試。'); return state === 'empty' ? null : mockDashboard;
} };
