"use client";

import React from "react";
import WrapSuccessCard, { type WrapTokenSummary } from "@/components/WrapSuccessCard";

interface QuickWrapSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetUrl: string;
  bridgeUrl: string;
  promptTemplate: string;
  projectName?: string;
  isExisting?: boolean;
  wrapTokens?: WrapTokenSummary;
  idempotentReplay?: boolean;
}

export default function QuickWrapSuccessModal({
  isOpen,
  onClose,
  sheetUrl: _sheetUrl,
  bridgeUrl,
  promptTemplate,
  projectName,
  isExisting = false,
  wrapTokens,
  idempotentReplay,
}: QuickWrapSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <WrapSuccessCard
      bridgeUrl={bridgeUrl}
      promptTemplate={promptTemplate}
      projectName={projectName}
      isExisting={isExisting}
      wrapTokens={wrapTokens}
      idempotentReplay={idempotentReplay}
      onClose={onClose}
    />
  );
}
