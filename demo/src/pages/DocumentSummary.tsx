import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Link as LinkIcon, Scale, FileText, BookMarked } from 'lucide-react';

interface Citation {
  title: string;
  reference: string;
  relevance: string;
  link?: string;
}

interface Document {
  title: string;
  summary: string;
  citations: Citation[];
  keywords: string[];
  fullDocumentUrl?: string;
  relevanceScore: number;
}

function DocumentSummary() {
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const summaryText = sessionStorage.getItem('documentSummary');
    if (summaryText) {
      try {
        const parsedSummary = JSON.parse(summaryText);
        setDocument({
          title: parsedSummary.title || 'Legal Analysis Summary',
          summary: parsedSummary.summary || summaryText,
          citations: parsedSummary.citations || [],
          keywords: parsedSummary.keywords || ['AI Generated', 'Legal Analysis', 'Case Summary'],
          relevanceScore: parsedSummary.relevanceScore || 0.95,
          fullDocumentUrl: parsedSummary.fullDocumentUrl
        });
      } catch (e) {
        setDocument({
          title: 'Legal Analysis Summary',
          summary: summaryText,
          citations: [],
          keywords: ['AI Generated', 'Legal Analysis', 'Case Summary'],
          relevanceScore: 0.95
        });
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-800 mx-auto mb-4"></div>
          <h2 className="text-xl font-medium text-gray-700">Processing document...</h2>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No summary available</h2>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-amber-800 text-white rounded-lg font-medium hover:bg-amber-900 transition-colors"
          >
            Return to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto pt-8 px-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Upload
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="border-b border-gray-200 pb-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">{document.title}</h1>
              <div className="flex items-center">
                <Scale className="w-5 h-5 text-amber-800 mr-2" />
                <span className="text-sm text-gray-600">
                  Relevance: {(document.relevanceScore * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {document.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="px-3 py-1 bg-amber-50 text-amber-800 rounded-full text-sm"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          <div className="prose max-w-none mb-8">
            <div className="flex items-center mb-4">
              <FileText className="w-6 h-6 text-amber-800 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Summary Analysis</h2>
            </div>
            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
              {document.summary}
            </div>
          </div>

          {document.citations.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center mb-4">
                <BookMarked className="w-6 h-6 text-amber-800 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Legal Citations</h2>
              </div>
              <div className="space-y-4">
                {document.citations.map((citation, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <h3 className="font-medium text-gray-900 mb-1">{citation.title}</h3>
                    <p className="text-gray-600 text-sm mb-2">{citation.reference}</p>
                    <p className="text-gray-700">{citation.relevance}</p>
                    {citation.link && (
                      <a
                        href={citation.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-amber-800 hover:text-amber-900 mt-2 text-sm"
                      >
                        <LinkIcon className="w-4 h-4 mr-1" />
                        View Citation
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4">
            {document.fullDocumentUrl && (
              <a
                href={document.fullDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-6 py-3 bg-amber-800 text-white rounded-lg font-medium hover:bg-amber-900 transition-colors"
              >
                <BookOpen className="w-5 h-5 mr-2" />
                View Full Document
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentSummary;