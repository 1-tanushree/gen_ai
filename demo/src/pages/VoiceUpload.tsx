import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, PlayCircle, StopCircle } from 'lucide-react';
import { Header } from '../components/Header';
import { AudioRecorder } from '../components/AudioRecorder';
import { FileUploader } from '../components/FileUploader';
import { TextInput } from '../components/TextInput';
import { ProcessingButton } from '../components/ProcessingButton';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcribeAudio, analyzeText } from '../utils/openai';

function VoiceUpload() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [inputMethod, setInputMethod] = useState<'none' | 'audio' | 'text'>('none');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    isRecording,
    recordingDuration,
    audioData,
    audioUrl,
    startRecording,
    stopRecording,
    resetRecording
  } = useAudioRecorder();

  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
    }
  }, [audioUrl]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecord = async () => {
    try {
      if (!isRecording) {
        await startRecording();
        setInputMethod('audio');
        setTextInput('');
      } else {
        stopRecording();
      }
    } catch (error) {
      alert('Could not access microphone. Please check your permissions.');
      resetRecording();
    }
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        if (audioRef.current) {
          audioRef.current.src = url;
        }
        setInputMethod('audio');
        setTextInput('');
      }
    };
    input.click();
  };

  const handleTextInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
    setInputMethod('text');
    resetRecording();
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(error => {
        console.error('Playback error:', error);
        alert('Error playing audio');
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleProcessing = async () => {
    if (inputMethod === 'none' || (inputMethod === 'audio' && !audioData) || (inputMethod === 'text' && !textInput)) {
      alert('Please provide input through voice, file, or text');
      return;
    }

    setIsProcessing(true);
    try {
      let analysisResult;
      
      if (inputMethod === 'audio' && audioData) {
        const audioFile = new File([audioData], 'audio.webm', { type: 'audio/webm' });
        const transcription = await transcribeAudio(audioFile);
        console.log('Transcription:', transcription); // Debug log
        analysisResult = await analyzeText(transcription);
      } else if (inputMethod === 'text' && textInput) {
        analysisResult = await analyzeText(textInput);
      }

      if (!analysisResult) {
        throw new Error('No analysis result received');
      }

      sessionStorage.setItem('documentSummary', analysisResult);
      navigate('/summary');
    } catch (error) {
      console.error('Processing error:', error);
      alert(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto pt-8 px-4">
        <Header />
        
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <AudioRecorder 
              isRecording={isRecording}
              onRecord={handleRecord}
              hasAudio={inputMethod === 'audio' && !!audioData}
            />
            <FileUploader 
              onUpload={handleUpload}
              hasFile={inputMethod === 'audio' && !!audioData}
            />
          </div>

          <div className="flex justify-center mb-8">
            <TextInput
              value={textInput}
              onChange={handleTextInput}
              hasText={inputMethod === 'text' && !!textInput}
            />
          </div>

          {(isRecording || audioData) && (
            <div className="mb-8">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  {isRecording ? (
                    <>
                      <Volume2 className="w-5 h-5 animate-pulse text-red-500 mr-2" />
                      <span className="text-red-500 font-medium">
                        Recording... {formatDuration(recordingDuration)}
                      </span>
                    </>
                  ) : audioData && (
                    <>
                      <button
                        onClick={togglePlayback}
                        className="flex items-center text-amber-800 hover:text-amber-900"
                      >
                        {isPlaying ? (
                          <StopCircle className="w-5 h-5 mr-2" />
                        ) : (
                          <PlayCircle className="w-5 h-5 mr-2" />
                        )}
                        {isPlaying ? 'Stop' : 'Play'} Recording
                      </button>
                      <audio
                        ref={audioRef}
                        onEnded={() => setIsPlaying(false)}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <ProcessingButton
              onClick={handleProcessing}
              isProcessing={isProcessing}
              disabled={isProcessing || inputMethod === 'none'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default VoiceUpload;