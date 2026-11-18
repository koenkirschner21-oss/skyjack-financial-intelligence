/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthLoadingScreen, LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import {
  AuditHistoryPage,
  SettingsAccessPage,
} from './pages/GovernancePages';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DataGatewayPage } from './pages/DataGatewayPage';
import { GlobalOperationsPage } from './pages/GlobalOperationsPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { TradePage } from './pages/TradePage';
import { SimulatorPage } from './pages/SimulatorPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { ReportStudioPage } from './pages/ReportStudioPage';

const RouteView: React.FC = () => {
  const { currentRoute, canViewRoute } = useApp();

  if (!canViewRoute(currentRoute)) {
    return (
      <div className="p-6 text-sm text-[#231F20]">
        This page is outside your assigned role. Use the navigation available to your account, or sign out.
      </div>
    );
  }

  switch (currentRoute) {
    case '/overview':
      return <OverviewPage />;
    case '/global-operations':
      return <GlobalOperationsPage />;
    case '/financials':
      return <FinancialsPage />;
    case '/trade':
      return <TradePage />;
    case '/simulator':
      return <SimulatorPage />;
    case '/investigations':
      return <InvestigationsPage />;
    case '/opportunities':
      return <OpportunitiesPage />;
    case '/reports':
      return <ReportStudioPage />;
    case '/data-gateway':
      return <DataGatewayPage />;
    case '/approvals':
      return <ApprovalsPage />;
    case '/audit':
      return <AuditHistoryPage />;
    case '/settings':
      return <SettingsAccessPage />;
  }
};

function AuthenticatedApp() {
  const { phase, appUser } = useAuth();
  if (phase === 'loading') return <AuthLoadingScreen />;
  if (phase !== 'signed_in' || !appUser) return <LoginPage />;
  return (
    <AppProvider authenticatedUser={appUser}>
      <AppShell>
        <RouteView />
      </AppShell>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
