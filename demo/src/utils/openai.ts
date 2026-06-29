import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  dangerouslyAllowBrowser: true
});

export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
    });

    if (!transcription.text) {
      throw new Error('No transcription received');
    }

    console.log('Transcription successful:', transcription.text);
    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio. Please check your Groq API key and try again.');
  }
};

export const analyzeText = async (text: string): Promise<string> => {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('No text provided for analysis');
    }

    console.log('Analyzing text:', text);

    const systemPrompt = `You are a bilingual legal assistant specializing in Indian law. The user may speak in Hindi or English. Analyze the legal argument and provide a fully bilingual response — every field must have both an English version and a Hindi (हिंदी) version.

Format the response as JSON with this exact structure:
{
  "title": "Title in English",
  "titleHi": "शीर्षक हिंदी में",
  "summary": "Detailed legal analysis in English",
  "summaryHi": "विस्तृत कानूनी विश्लेषण हिंदी में",
  "citations": [
    {
      "title": "Case name",
      "reference": "Citation reference e.g. AIR 1978 SC 597",
      "relevance": "Why this case is relevant — in English",
      "relevanceHi": "यह मामला क्यों प्रासंगिक है — हिंदी में"
    }
  ],
  "articles": [
    {
      "reference": "Short reference e.g. Article 21, Constitution of India",
      "exactText": "The verbatim legal text of the article or section as it appears in the statute (keep in original English)",
      "exactTextHi": "अनुच्छेद या धारा का हिंदी अनुवाद (यदि आधिकारिक हिंदी संस्करण उपलब्ध है, अन्यथा अनुवाद करें)",
      "plainExplanation": "A clear, simple explanation in plain English that a non-lawyer can understand",
      "plainExplanationHi": "सरल हिंदी में स्पष्टीकरण जो एक सामान्य व्यक्ति समझ सके"
    }
  ],
  "keywords": ["relevant", "english", "keywords"],
  "keywordsHi": ["प्रासंगिक", "हिंदी", "कीवर्ड"],
  "relevanceScore": 0.95
}

RULES:
- Always include BOTH English and Hindi versions of every text field.
- For "exactText", keep the verbatim statutory text. Do not paraphrase.
- If the user spoke in Hindi, ensure the Hindi fields read naturally in Hindi, not like a literal translation.
- The citation "title" and "reference" fields stay in their original form (they are proper nouns/codes).`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response received from Groq');
    }

    console.log('Groq response received:', content);

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    const parsedContent = JSON.parse(cleaned);
    if (!parsedContent.title || !parsedContent.summary) {
      throw new Error('Invalid response structure');
    }
    return JSON.stringify(parsedContent);
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
};

export interface Contradiction {
  case1: string;
  case2: string;
  description: string;
  descriptionHi?: string;
}

export interface ContradictionResult {
  hasContradiction: boolean;
  contradictions: Contradiction[];
}

export const detectContradictions = async (
  citations: { title: string; reference: string; relevance: string }[]
): Promise<ContradictionResult> => {
  if (citations.length < 2) return { hasContradiction: false, contradictions: [] };

  const systemPrompt = `You are an Indian legal expert. Analyze the cited cases below and detect any genuine contradictions — cases that establish opposing rules or principles on the same legal point.

Return ONLY valid JSON (no markdown fences):
{
  "hasContradiction": true,
  "contradictions": [
    {
      "case1": "First case name",
      "case2": "Second case name",
      "description": "Clear English explanation of how these cases contradict each other",
      "descriptionHi": "इन मामलों के बीच विरोधाभास की हिंदी में स्पष्ट व्याख्या"
    }
  ]
}
If no real contradictions exist return { "hasContradiction": false, "contradictions": [] }.
Only flag genuine legal contradictions, not mere differences in fact patterns.`;

  const text = citations
    .map((c, i) => `${i + 1}. ${c.title} (${c.reference}): ${c.relevance}`)
    .join('\n');

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { hasContradiction: false, contradictions: [] };
  }
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const chatWithContext = async (
  history: ChatMessage[],
  analysisContext: string,
  lang: 'en' | 'hi'
): Promise<string> => {
  const langInstruction = lang === 'hi'
    ? 'Always respond in Hindi (हिंदी में उत्तर दें). Use clear, simple Hindi.'
    : 'Respond in English.';

  const systemPrompt = `You are a legal assistant specializing in Indian law. A legal matter has already been analyzed and the full analysis is provided below as your context. Answer follow-up questions based on this analysis and your legal knowledge. Be concise and helpful. ${langInstruction}

--- ANALYSIS CONTEXT ---
${analysisContext}
--- END CONTEXT ---`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
    ],
    temperature: 0.6,
    max_tokens: 1000,
  });

  return completion.choices[0]?.message?.content ?? '';
};
