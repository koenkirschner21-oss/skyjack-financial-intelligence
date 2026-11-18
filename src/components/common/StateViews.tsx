import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { DataSourceProvenance } from '../../types/domain';
import { useLayer2HeaderNode } from '../layout/Layer2HeaderContext';

const PROVENANCE_LABELS: Record<DataSourceProvenance, string> = {
  official_case_data: 'Official Case Data',
  derived_calculation: 'Derived Calculation',
  hypothetical_scenario: 'Hypothetical Scenario',
  demonstration_state: 'Demonstration State',
  user_uploaded: 'User-Uploaded Data',
};

export const ProvenanceText: React.FC<{
  provenance: DataSourceProvenance;
  sourceRef?: string;
  className?: string;
}> = ({ provenance, sourceRef, className = '' }) => {
  return (
    <span className={`text-xs text-[#5F6368] whitespace-nowrap ${className}`}>
      {PROVENANCE_LABELS[provenance]}
      {sourceRef ? ` · ${sourceRef}` : ''}
    </span>
  );
};

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  metadata?: string[];
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  const layer2Node = useLayer2HeaderNode();

  const headerBody = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[19px] sm:text-[21px] font-semibold tracking-[-0.015em] text-[#231F20] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-[#5F6368] mt-1 max-w-3xl leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );

  if (layer2Node) {
    return createPortal(headerBody, layer2Node);
  }

  return (
    <div className="pb-4 border-b border-[#E2E5E8]">
      {headerBody}
    </div>
  );
};

interface UnavailableDataStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const UnavailableDataState: React.FC<UnavailableDataStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="bg-white border border-[#E2E5E8] rounded-md p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-[#F5F6F7] text-[#5F6368] shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#231F20]">{title}</h3>
          <p className="text-xs text-[#5F6368] mt-1 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-3.5 py-2 text-xs font-medium text-[#231F20] bg-[#F5F6F7] border border-[#E2E5E8] rounded hover:bg-[#ECEEF0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading financial records...' }) => (
  <div className="bg-white border border-[#E2E5E8] rounded-md p-8 flex items-center justify-center gap-3 text-sm text-[#5F6368]">
    <Loader2 className="w-4 h-4 animate-spin text-[#E53C2E]" />
    <span>{label}</span>
  </div>
);

export const ErrorState: React.FC<{ title: string; message: string; onRetry?: () => void }> = ({
  title,
  message,
  onRetry,
}) => (
  <div className="bg-white border border-[#E2E5E8] rounded-md p-6 flex items-start justify-between gap-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[#E53C2E] shrink-0 mt-0.5" />
      <div>
        <h3 className="text-sm font-semibold text-[#231F20]">{title}</h3>
        <p className="text-xs text-[#5F6368] mt-1">{message}</p>
      </div>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] transition-colors whitespace-nowrap cursor-pointer"
      >
        Retry
      </button>
    )}
  </div>
);
