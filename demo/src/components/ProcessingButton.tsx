import React from 'react';
import { Loader2 } from 'lucide-react';

interface ProcessingButtonProps {
  onClick: () => void;
  isProcessing: boolean;
  disabled: boolean;
}

export function ProcessingButton({ onClick, isProcessing, disabled }: ProcessingButtonProps) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-2.5 bg-amber-800 text-white rounded-lg font-medium hover:bg-amber-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
    >
      {isProcessing ? (
        <div className="flex items-center">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Processing your request...
        </div>
      ) : (
        'Analyze and Summarize'
      )}
    </button>
  );
}