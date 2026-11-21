'use client';

import React from 'react';
import { AlertTriangle, AlertCircle, Info, Loader2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      badgeBg: 'bg-red-950/80 border-red-800 text-red-400',
      icon: <AlertTriangle className="h-5 w-5 text-red-400" />,
      btnBg: 'bg-red-600 hover:bg-red-500 focus:ring-red-500/40 text-white shadow-red-600/20',
    },
    warning: {
      badgeBg: 'bg-amber-950/80 border-amber-800 text-amber-400',
      icon: <AlertCircle className="h-5 w-5 text-amber-400" />,
      btnBg: 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-500/40 text-white shadow-amber-600/20',
    },
    primary: {
      badgeBg: 'bg-blue-950/80 border-blue-800 text-blue-400',
      icon: <Info className="h-5 w-5 text-blue-400" />,
      btnBg: 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500/40 text-white shadow-blue-600/20',
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-xl border shrink-0 ${variantStyles.badgeBg}`}>
            {variantStyles.icon}
          </div>
          <div className="space-y-1 pr-4">
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            <div className="text-xs text-slate-400 leading-relaxed">{description}</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 ${variantStyles.btnBg}`}
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
