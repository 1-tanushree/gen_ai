import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import VoiceUpload from './pages/VoiceUpload';
import DocumentSummary from './pages/DocumentSummary';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VoiceUpload />} />
        <Route path="/summary" element={<DocumentSummary />} />
      </Routes>
    </Router>
  );
}

export default App;