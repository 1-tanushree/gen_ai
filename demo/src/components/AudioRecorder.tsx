import React from 'react';
import { Mic } from 'lucide-react';

interface AudioRecorderProps {
  isRecording: boolean;
  onRecord: () => void;
  hasAudio: boolean;
}

export function AudioRecorder({ isRecording, onRecord, hasAudio }: AudioRecorderProps) {
  return (
    <button
      onClick={onRecord}
      className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all h-48 ${
        isRecording
          ? 'border-red-500 bg-red-50'
          : hasAudio
          ? 'border-green-500 bg-green-50'
          : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
      }`}
    >
      <div className={`p-4 rounded-full ${isRecording ? 'bg-red-100' : 'bg-gray-100'} mb-4`}>
        <Mic className={`w-8 h-8 ${isRecording ? 'text-red-500' : 'text-gray-600'}`} />
      </div>
      <span className="text-lg font-medium text-gray-900">
        {isRecording ? 'Stop Recording' : 'Record Voice'}
      </span>
      <span className="text-sm text-gray-500 mt-2">
        Click to {isRecording ? 'stop' : 'start'} recording
      </span>
    </button>
  );
}