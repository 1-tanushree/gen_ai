import React from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onUpload: () => void;
  hasFile: boolean;
}

export function FileUploader({ onUpload, hasFile }: FileUploaderProps) {
  return (
    <button
      onClick={onUpload}
      className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all h-48 ${
        hasFile
          ? 'border-green-500 bg-green-50'
          : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
      }`}
    >
      <div className="p-4 rounded-full bg-gray-100 mb-4">
        <Upload className="w-8 h-8 text-gray-600" />
      </div>
      <span className="text-lg font-medium text-gray-900">Upload Voice File</span>
      <span className="text-sm text-gray-500 mt-2">Click to choose a file</span>
    </button>
  );
}