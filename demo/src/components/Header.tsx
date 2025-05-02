import React from 'react';
import { Gavel } from 'lucide-react';

export function Header() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex flex-col items-center">
        <div className="flex items-center gap-3">
          <Gavel className="w-8 h-8 text-amber-800" />
          <h1 className="text-3xl font-bold text-amber-900">Court Vision</h1>
        </div>
        <div className="h-0.5 w-24 bg-amber-800 mt-2 mb-2"></div>
      </div>
      <p className="text-base text-gray-600">Digital Assistant for Indian Courts</p>
    </div>
  );
}