import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardStatus, PlanDashboard } from './components';
import { trainingPlanApi } from './api';
import type { TrainingPlanDashboardData } from './types';
import './styles.css';
type State = 'loading' | 'ready' | 'empty' | 'error';
declare global { interface Window { __trainingDashboardData?: TrainingPlanDashboardData; } }
function App() {
  const [state, setState] = useState<State>('loading'); const [data, setData] = useState<TrainingPlanDashboardData | null>(null); const [message, setMessage] = useState<string>();
  const load = useCallback(async () => { setState('loading'); try { const result = await trainingPlanApi.getDashboard(); setData(result); setState(result ? 'ready' : 'empty'); } catch (error) { setMessage((error as Error).message); setState('error'); } }, []);
  useEffect(() => { void load(); }, [load]);
  return state === 'ready' && data ? <PlanDashboard data={data}/> : <DashboardStatus state={state === 'ready' ? 'empty' : state} message={message} onRetry={() => void load()}/>;
}
function LegacyHeroApp() {
  const [data, setData] = useState<TrainingPlanDashboardData | undefined>(window.__trainingDashboardData);
  useEffect(() => {
    const update = (event: Event) => setData((event as CustomEvent<TrainingPlanDashboardData>).detail);
    window.addEventListener('training-dashboard:update', update);
    return () => window.removeEventListener('training-dashboard:update', update);
  }, []);
  return data ? <PlanDashboard data={data}/> : <DashboardStatus state="loading"/>;
}
const legacyRoot = document.getElementById('training-dashboard-root');
createRoot(legacyRoot ?? document.getElementById('root')!).render(<StrictMode>{legacyRoot ? <LegacyHeroApp/> : <App/>}</StrictMode>);
