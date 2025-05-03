import React from 'react';
import { Type } from 'lucide-react';

interface TextInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  hasText: boolean;
}

export function TextInput({ value, onChange, hasText }: TextInputProps) {
  return (
    <div
      className={`w-1/2 p-6 rounded-xl border-2 border-dashed transition-all h-48 ${
        hasText ? 'border-green-500 bg-green-50' : 'border-gray-300'
      }`}
    >
      <div className="flex flex-col items-center h-full">
        <div className="p-2 rounded-full bg-gray-100 mb-2">
          <Type className="w-6 h-6 text-gray-600" />
        </div>
        <span className="text-lg font-medium text-gray-900 mb-3">Type Your Argument</span>
        <div className="w-full flex-grow flex items-stretch">
          <textarea
            className="w-full p-2 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Type your legal argument here..."
            value={value}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}