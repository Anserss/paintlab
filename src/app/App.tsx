import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { DepotPage } from '@/features/depot/DepotPage';
import { MixPage } from '@/features/mix/MixPage';
import { ProcurePage } from '@/features/procure/ProcurePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { StationPage } from '@/features/station/StationPage';

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/procure" element={<ProcurePage />} />
        <Route path="/depot" element={<DepotPage />} />
        <Route path="/mix" element={<MixPage />} />
        <Route path="/station" element={<StationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/procure" replace />} />
      </Route>
    </Routes>
  );
}
