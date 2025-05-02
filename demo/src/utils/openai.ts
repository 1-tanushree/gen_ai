import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    if (!transcription.text) {
      throw new Error('No transcription received');
    }

    console.log('Transcription successful:', transcription.text); // Debug log
    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio. Please check your API key and try again.');
  }
};

export const analyzeText = async (text: string): Promise<string> => {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('No text provided for analysis');
    }

    console.log('Analyzing text:', text); // Debug log

    const systemPrompt = `You are a legal assistant specializing in Indian law. Analyze the following legal argument and provide:
1. A comprehensive summary
2. Relevant case citations
3. Key legal principles
4. Recommendations if applicable

Format the response as JSON with the following structure:
{
  "title": "Title of the analysis",
  "summary": "Detailed analysis",
  "citations": [
    {
      "title": "Case name",
      "reference": "Citation reference",
      "relevance": "Why this case is relevant"
    }
  ],
  "keywords": ["relevant", "legal", "keywords"],
  "relevanceScore": 0.95
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response received from GPT');
    }

    console.log('GPT response received:', content); // Debug log

    try {
      // Validate JSON structure
      const parsedContent = JSON.parse(content);
      if (!parsedContent.title || !parsedContent.summary) {
        throw new Error('Invalid response structure');
      }
      return JSON.stringify(parsedContent);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      throw parseError; // Throw the actual parsing error
    }
  } catch (error) {
    console.error('Analysis error:', error);
    // Throw the original error to preserve the specific error message
    throw error;
  }
};