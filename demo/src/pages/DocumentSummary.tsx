import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Link as LinkIcon, Scale, FileText,
  BookMarked, ChevronDown, ChevronUp, Loader2, Scroll,
  Send, MessageSquare, AlertTriangle, ShieldCheck, ShieldAlert, Swords,
} from 'lucide-react';
import { fetchIndianKanoonDoc, IKDocument } from '../utils/indianKanoon';
import { chatWithContext, ChatMessage, detectContradictions, ContradictionResult } from '../utils/openai';
import { checkOverruled, OverruledResult, severityConfig, Severity } from '../utils/overruledCheck';
import { CitationGraph } from '../components/CitationGraph';

type Lang = 'en' | 'hi';

interface Citation {
  title: string;
  reference: string;
  relevance: string;
  relevanceHi?: string;
  link?: string;
  ikDocId?: number;
}

interface Article {
  reference: string;
  exactText: string;
  exactTextHi?: string;
  plainExplanation: string;
  plainExplanationHi?: string;
  link?: string;
  ikDocId?: number;
}

interface Document {
  title: string;
  titleHi?: string;
  summary: string;
  summaryHi?: string;
  citations: Citation[];
  articles: Article[];
  keywords: string[];
  keywordsHi?: string[];
  fullDocumentUrl?: string;
  relevanceScore: number;
}

// ── Language toggle ──────────────────────────────────────────────────────────
function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-full p-1 gap-1 select-none shrink-0">
      {(['en', 'hi'] as Lang[]).map(l => (
        <button key={l} onClick={() => onChange(l)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {l === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  );
}

// ── Overruled badge ──────────────────────────────────────────────────────────
function OverruledBadge({ result, lang }: { result: OverruledResult | null; lang: Lang }) {
  const [open, setOpen] = useState(false);

  if (!result) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        {lang === 'hi' ? 'जाँच...' : 'Checking...'}
      </span>
    );
  }

  const cfg = severityConfig[result.severity as Severity];
  const label = lang === 'hi' ? cfg.labelHi : cfg.label;

  return (
    <div className="mt-2">
      <button
        onClick={() => result.evidence.length > 0 && setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.border} ${cfg.text} ${result.evidence.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
        {result.severity === 'HIGH' && <ShieldAlert className="w-3 h-3" />}
        {result.severity === 'SAFE' && <ShieldCheck className="w-3 h-3" />}
        {label}
        {result.evidence.length > 0 && (
          open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </button>

      {open && result.evidence.length > 0 && (
        <div className={`mt-2 rounded-lg border p-3 text-xs space-y-2 ${cfg.bg} ${cfg.border}`}>
          <p className={`font-semibold ${cfg.text}`}>
            {lang === 'hi' ? 'साक्ष्य (स्रोत जो इसे खारिज करते हैं)' : 'Evidence (sources that may have overruled this)'}
          </p>
          {result.evidence.slice(0, 4).map((e, i) => (
            <div key={i} className="bg-white rounded p-2 border border-gray-200">
              <p className="font-medium text-gray-800">{e.title}</p>
              <p className="text-gray-500">{e.court} · {e.date}</p>
              {e.fragment && (
                <p className="text-gray-600 mt-1 line-clamp-3 italic">"{e.fragment}"</p>
              )}
              {e.docid && (
                <a href={`https://indiankanoon.org/doc/${e.docid}/`} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs mt-1 inline-block">
                  {lang === 'hi' ? 'इंडियन कानून पर देखें →' : 'View on Indian Kanoon →'}
                </a>
              )}
            </div>
          ))}
          <p className={`text-xs ${cfg.text} font-medium`}>
            {lang === 'hi'
              ? `जाँच चरण: ${result.stage === 1 ? 'त्वरित खोज' : 'उद्धरण विश्लेषण'}`
              : `Detection stage: ${result.stage === 1 ? 'Fast keyword search' : 'Citation scan'}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Contradiction panel ──────────────────────────────────────────────────────
function ContradictionPanel({ result, lang }: { result: ContradictionResult | null; lang: Lang }) {
  if (!result) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {lang === 'hi' ? 'विरोधाभास विश्लेषण चल रहा है...' : 'Detecting precedent contradictions...'}
      </div>
    );
  }

  if (!result.hasContradiction) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        {lang === 'hi' ? 'उद्धृत मामलों के बीच कोई विरोधाभास नहीं मिला।' : 'No contradictions detected among the cited precedents.'}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-red-100 border-b border-red-200">
        <Swords className="w-4 h-4 text-red-700 shrink-0" />
        <h3 className="font-semibold text-red-800 text-sm">
          {lang === 'hi'
            ? `${result.contradictions.length} विरोधाभास मिले`
            : `${result.contradictions.length} Precedent Contradiction${result.contradictions.length > 1 ? 's' : ''} Detected`}
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {result.contradictions.map((c, i) => (
          <div key={i} className="bg-white rounded-lg border border-red-200 p-3">
            <div className="flex flex-wrap gap-1 items-center mb-2">
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{c.case1}</span>
              <span className="text-red-400 text-xs font-bold">⚡</span>
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{c.case2}</span>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed">
              {lang === 'hi' && c.descriptionHi ? c.descriptionHi : c.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Citation card (with overruled badge) ─────────────────────────────────────
function CitationCard({
  citation, lang, overruledResult,
}: { citation: Citation; lang: Lang; overruledResult: OverruledResult | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [ikDoc, setIkDoc] = useState<IKDocument | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const handleFetch = async () => {
    if (ikDoc) { setExpanded(p => !p); return; }
    if (!citation.ikDocId) return;
    setLoadingDoc(true);
    setFetchError(false);
    const doc = await fetchIndianKanoonDoc(citation.ikDocId);
    setLoadingDoc(false);
    if (doc) { setIkDoc(doc); setExpanded(true); }
    else setFetchError(true);
  };

  const relevance = lang === 'hi' && citation.relevanceHi ? citation.relevanceHi : citation.relevance;

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <h3 className="font-medium text-gray-900">{citation.title}</h3>
          {/* overruled result is undefined while loading, null means no ikDocId */}
          {citation.ikDocId && (
            <OverruledBadge result={overruledResult ?? null} lang={lang} />
          )}
        </div>
        <p className="text-gray-500 text-xs mb-2">{citation.reference}</p>
        <p className="text-gray-700 text-sm leading-relaxed">{relevance}</p>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          {citation.link && (
            <a href={citation.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center text-amber-800 hover:text-amber-900 text-sm font-medium">
              <LinkIcon className="w-3.5 h-3.5 mr-1" />
              {lang === 'hi' ? 'इंडियन कानून पर देखें' : 'View on Indian Kanoon'}
            </a>
          )}
          {citation.ikDocId && (
            <button onClick={handleFetch} disabled={loadingDoc}
              className="flex items-center text-sm text-blue-700 hover:text-blue-900 disabled:opacity-50">
              {loadingDoc
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />{lang === 'hi' ? 'लोड...' : 'Loading...'}</>
                : expanded
                  ? <><ChevronUp className="w-3.5 h-3.5 mr-1" />{lang === 'hi' ? 'छुपाएं' : 'Hide'}</>
                  : <><ChevronDown className="w-3.5 h-3.5 mr-1" />{lang === 'hi' ? 'दस्तावेज़ लाएं' : 'Fetch Document'}</>}
            </button>
          )}
          {fetchError && <span className="text-xs text-red-500">{lang === 'hi' ? 'नहीं मिला।' : 'Not found.'}</span>}
        </div>
      </div>
      {expanded && ikDoc && (
        <div className="border-t border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-2">{ikDoc.docsource} · {ikDoc.publishdate}</p>
          <div className="prose prose-sm max-w-none text-gray-800 max-h-80 overflow-y-auto text-sm"
            dangerouslySetInnerHTML={{ __html: ikDoc.doc }} />
        </div>
      )}
    </div>
  );
}

// ── Article card ─────────────────────────────────────────────────────────────
function ArticleCard({ article, lang }: { article: Article; lang: Lang }) {
  const [showPlain, setShowPlain] = useState(true);
  const [showExact, setShowExact] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [ikDoc, setIkDoc] = useState<IKDocument | null>(null);
  const [ikExpanded, setIkExpanded] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const handleFetch = async () => {
    if (ikDoc) { setIkExpanded(p => !p); return; }
    if (!article.ikDocId) return;
    setLoadingDoc(true);
    const doc = await fetchIndianKanoonDoc(article.ikDocId);
    setLoadingDoc(false);
    if (doc) { setIkDoc(doc); setIkExpanded(true); }
    else setFetchError(true);
  };

  const plain = lang === 'hi' && article.plainExplanationHi ? article.plainExplanationHi : article.plainExplanation;
  const exact = lang === 'hi' && article.exactTextHi ? article.exactTextHi : article.exactText;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-indigo-900 text-sm">{article.reference}</h3>
          {article.link && (
            <a href={article.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center text-indigo-600 hover:text-indigo-800 text-xs shrink-0">
              <LinkIcon className="w-3 h-3 mr-1" />
              {lang === 'hi' ? 'इंडियन कानून' : 'Indian Kanoon'}
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowPlain(p => !p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${showPlain ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-300 hover:bg-indigo-50'}`}>
            {lang === 'hi' ? 'सरल व्याख्या' : 'Easy Explanation'}
          </button>
          <button onClick={() => setShowExact(p => !p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${showExact ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
            {lang === 'hi' ? 'मूल कानूनी पाठ' : 'Exact Legal Text'}
          </button>
          {article.ikDocId && (
            <button onClick={handleFetch} disabled={loadingDoc}
              className="px-3 py-1 rounded-full text-xs font-medium bg-white text-blue-600 border border-blue-300 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1">
              {loadingDoc
                ? <><Loader2 className="w-3 h-3 animate-spin" />{lang === 'hi' ? 'लोड...' : 'Loading...'}</>
                : ikExpanded ? (lang === 'hi' ? 'छुपाएं' : 'Hide Statute') : (lang === 'hi' ? 'पूरा कानून लाएं' : 'Fetch Full Statute')}
            </button>
          )}
        </div>
        {showPlain && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-600 mb-1 uppercase tracking-wide">
              {lang === 'hi' ? 'सरल भाषा में' : 'Plain Language'}
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">{plain}</p>
          </div>
        )}
        {showExact && (
          <div className="mt-3 p-3 bg-gray-900 rounded-lg">
            <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
              {lang === 'hi' ? 'मूल पाठ' : 'Verbatim Legal Text'}
            </p>
            <p className="text-green-300 text-sm leading-relaxed font-mono whitespace-pre-wrap">{exact}</p>
          </div>
        )}
        {fetchError && <p className="text-xs text-red-500 mt-2">{lang === 'hi' ? 'कानून नहीं मिला।' : 'Could not fetch statute.'}</p>}
      </div>
      {ikExpanded && ikDoc && (
        <div className="border-t border-indigo-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-2">{ikDoc.docsource} · {ikDoc.publishdate}</p>
          <div className="prose prose-sm max-w-none text-gray-800 max-h-80 overflow-y-auto text-sm"
            dangerouslySetInnerHTML={{ __html: ikDoc.doc }} />
        </div>
      )}
    </div>
  );
}

// ── Follow-up chat ───────────────────────────────────────────────────────────
function ChatPanel({ analysisContext, lang }: { analysisContext: string; lang: Lang }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const updated = [...messages, { role: 'user' as const, content: text }];
    setMessages(updated);
    setInput('');
    setLoading(true);
    try {
      const reply = await chatWithContext(updated, analysisContext, lang);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: lang === 'hi' ? 'क्षमा करें, एक त्रुटि हुई।' : 'Sorry, an error occurred.',
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50">
        <MessageSquare className="w-5 h-5 text-amber-800" />
        <h2 className="font-semibold text-gray-900">
          {lang === 'hi' ? 'आगे के प्रश्न' : 'Follow-up Questions'}
        </h2>
      </div>
      <div className="h-72 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-10">
            {lang === 'hi' ? 'ऊपर दिए गए विश्लेषण के बारे में कुछ भी पूछें।' : 'Ask anything about the analysis above.'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-amber-800 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-100 bg-white flex gap-2 items-end">
        <textarea ref={inputRef} value={input} rows={1}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={lang === 'hi' ? 'प्रश्न पूछें... (Enter से भेजें)' : 'Ask a follow-up... (Enter to send)'}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-transparent max-h-32 overflow-y-auto"
          style={{ minHeight: '42px' }} />
        <button onClick={send} disabled={!input.trim() || loading}
          className="shrink-0 p-2.5 rounded-xl bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Context builder ──────────────────────────────────────────────────────────
function buildContext(doc: Document): string {
  return [
    `Title: ${doc.title}`,
    `Summary: ${doc.summary}`,
    doc.articles.length ? '\nReferenced Articles:\n' + doc.articles.map(a =>
      `- ${a.reference}: ${a.exactText}\n  Explanation: ${a.plainExplanation}`).join('\n') : '',
    doc.citations.length ? '\nLegal Citations:\n' + doc.citations.map(c =>
      `- ${c.title} (${c.reference}): ${c.relevance}`).join('\n') : '',
  ].join('\n');
}

// ── Main page ────────────────────────────────────────────────────────────────
function DocumentSummary() {
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>('en');

  // overruled results: key = ikDocId, undefined = still loading, null = no ikDocId
  const [overruledMap, setOverruledMap] = useState<Record<number, OverruledResult>>({});
  const [contradictions, setContradictions] = useState<ContradictionResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('documentSummary');
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setDocument({
          title: p.title || 'Legal Analysis Summary',
          titleHi: p.titleHi,
          summary: p.summary || raw,
          summaryHi: p.summaryHi,
          citations: p.citations || [],
          articles: p.articles || [],
          keywords: p.keywords || ['AI Generated', 'Legal Analysis'],
          keywordsHi: p.keywordsHi,
          relevanceScore: p.relevanceScore || 0.95,
          fullDocumentUrl: p.fullDocumentUrl,
        });
      } catch {
        setDocument({
          title: 'Legal Analysis Summary',
          summary: raw,
          citations: [], articles: [],
          keywords: ['AI Generated', 'Legal Analysis'],
          relevanceScore: 0.95,
        });
      }
    }
    setLoading(false);
  }, []);

  // Run overruled checks + contradiction detection after document loads
  useEffect(() => {
    if (!document) return;

    // Overruled checks — one per citation with an ikDocId
    document.citations.forEach(c => {
      if (!c.ikDocId) return;
      checkOverruled(c.ikDocId, c.title)
        .then(result => setOverruledMap(prev => ({ ...prev, [c.ikDocId!]: result })))
        .catch(() => {/* silent fail */});
    });

    // Contradiction detection — run if 2+ citations
    if (document.citations.length >= 2) {
      detectContradictions(document.citations)
        .then(setContradictions)
        .catch(() => setContradictions({ hasContradiction: false, contradictions: [] }));
    } else {
      setContradictions({ hasContradiction: false, contradictions: [] });
    }
  }, [document]);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-800 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-gray-700">Processing document...</h2>
      </div>
    </div>
  );

  if (!document) return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">No summary available</h2>
        <button onClick={() => navigate('/')}
          className="px-6 py-3 bg-amber-800 text-white rounded-lg font-medium hover:bg-amber-900">
          Return to Upload
        </button>
      </div>
    </div>
  );

  const title    = lang === 'hi' && document.titleHi ? document.titleHi : document.title;
  const summary  = lang === 'hi' && document.summaryHi ? document.summaryHi : document.summary;
  const keywords = lang === 'hi' && document.keywordsHi?.length ? document.keywordsHi : document.keywords;

  // Count high-severity citations for the header warning pill
  const highCount = Object.values(overruledMap).filter(r => r.severity === 'HIGH' || r.severity === 'MEDIUM').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto pt-6 pb-12 px-4 space-y-6">

        {/* Nav row */}
        <div className="flex items-center justify-between gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center text-gray-600 hover:text-gray-900 text-sm font-medium shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {lang === 'hi' ? 'वापस जाएं' : 'Back to Upload'}
          </button>
          <div className="flex items-center gap-3">
            {highCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {highCount} {lang === 'hi' ? 'संदिग्ध उद्धरण' : `Overruled Alert${highCount > 1 ? 's' : ''}`}
              </span>
            )}
            <LangToggle lang={lang} onChange={setLang} />
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 space-y-8">

          {/* Header */}
          <div className="border-b border-gray-100 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{title}</h1>
              <div className="flex items-center shrink-0 bg-amber-50 px-3 py-1.5 rounded-full">
                <Scale className="w-4 h-4 text-amber-800 mr-1.5" />
                <span className="text-sm text-amber-900 font-medium">
                  {lang === 'hi' ? 'प्रासंगिकता' : 'Relevance'}: {(document.relevanceScore * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map(kw => (
                <span key={kw} className="px-3 py-1 bg-amber-50 text-amber-800 rounded-full text-xs font-medium">{kw}</span>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div>
            <div className="flex items-center mb-3">
              <FileText className="w-5 h-5 text-amber-800 mr-2 shrink-0" />
              <h2 className="text-lg font-semibold text-gray-900">
                {lang === 'hi' ? 'सारांश विश्लेषण' : 'Summary Analysis'}
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed text-sm sm:text-base whitespace-pre-wrap">{summary}</p>
          </div>

          {/* Citation Network Graph */}
          {document.citations.length > 0 && (
            <div>
              <CitationGraph
                centerLabel={document.title}
                citations={document.citations}
                overruledMap={overruledMap}
                lang={lang}
              />
            </div>
          )}

          {/* Articles */}
          {document.articles.length > 0 && (
            <div>
              <div className="flex items-center mb-3">
                <Scroll className="w-5 h-5 text-indigo-700 mr-2 shrink-0" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {lang === 'hi' ? 'उल्लिखित अनुच्छेद और धाराएं' : 'Referenced Articles & Sections'}
                </h2>
              </div>
              <div className="space-y-3">
                {document.articles.map((a, i) => <ArticleCard key={i} article={a} lang={lang} />)}
              </div>
            </div>
          )}

          {/* Contradiction panel — shown above citations */}
          {document.citations.length >= 2 && (
            <div>
              <div className="flex items-center mb-3">
                <Swords className="w-5 h-5 text-red-600 mr-2 shrink-0" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {lang === 'hi' ? 'विरोधाभास विश्लेषण' : 'Precedent Contradiction Analysis'}
                </h2>
              </div>
              <ContradictionPanel result={contradictions} lang={lang} />
            </div>
          )}

          {/* Citations with overruled badges */}
          {document.citations.length > 0 && (
            <div>
              <div className="flex items-center mb-3">
                <BookMarked className="w-5 h-5 text-amber-800 mr-2 shrink-0" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {lang === 'hi' ? 'कानूनी उद्धरण' : 'Legal Citations'}
                </h2>
              </div>
              <div className="space-y-3">
                {document.citations.map((c, i) => (
                  <CitationCard key={i} citation={c} lang={lang}
                    overruledResult={c.ikDocId ? overruledMap[c.ikDocId] : null} />
                ))}
              </div>
            </div>
          )}

          {document.fullDocumentUrl && (
            <div className="flex justify-center pt-2">
              <a href={document.fullDocumentUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center px-6 py-3 bg-amber-800 text-white rounded-xl font-medium hover:bg-amber-900 transition-colors text-sm">
                <BookOpen className="w-4 h-4 mr-2" />
                {lang === 'hi' ? 'पूरा दस्तावेज़ देखें' : 'View Full Document'}
              </a>
            </div>
          )}
        </div>

        {/* Follow-up chat */}
        <ChatPanel analysisContext={buildContext(document)} lang={lang} />
      </div>
    </div>
  );
}

export default DocumentSummary;
