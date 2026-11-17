import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { DepotPage } from '@/features/depot/DepotPage';
import { MixPage } from '@/features/mix/MixPage';
import { ProcurePage } from '@/features/procure/ProcurePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { WorkbenchPage } from '@/features/workbench/WorkbenchPage';

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/procure" element={<ProcurePage />} />
        <Route path="/depot" element={<DepotPage />} />
        <Route path="/mix" element={<MixPage />} />
        <Route path="/workbench" element={<WorkbenchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/procure" replace />} />
      </Route>
    </Routes>
  );
}
