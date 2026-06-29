# LexAI — AI Courtroom Assistant for Indian Law

An AI-powered legal assistant that listens to courtroom arguments, extracts case citations, fetches real judgments from Indian Kanoon, and alerts lawyers when a cited case has been overruled.

## Features

- 🎙️ **Voice & Text Input** — Speak or type a legal argument; Whisper ASR transcribes it instantly
- 📄 **Legal Analysis** — LLaMA 3.3 70B summarizes the argument, extracts citations, and identifies referenced articles/sections
- ⚖️ **Overruled Case Alert** — Two-stage detection checks if a cited case was later overruled by a higher court (red alert if so)
- ⚡ **Precedent Contradiction Detector** — Automatically flags when two cited cases contradict each other
- 🕸️ **Citation Network Graph** — D3.js force-directed graph showing how cited cases link to each other
- 📖 **Article Lookup** — Exact legal text + plain-English explanation for every mentioned article or section
- 🌐 **Bilingual** — Full English and Hindi support; toggle on the response page
- 💬 **Follow-up Chat** — Ask further questions with full case context retained

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Graph | D3.js force-directed simulation |
| Speech-to-Text | Whisper Large v3 via Groq |
| LLM | LLaMA 3.3 70B via Groq |
| Legal Data | Indian Kanoon API |
| Backend Proxy | Python Flask |

## Setup

### 1. Clone the repo

git clone https://github.com/1-tanushree/gen_ai.git
cd gen_ai
2. Backend

pip install flask flask-cors python-dotenv
cp .env.example .env        # add your INDIAN_KANOON_API_TOKEN
python server.py
3. Frontend

cd demo
cp .env.example .env        # add your VITE_GROQ_API_KEY
npm install
npm run dev
Open http://localhost:5173

Environment Variables
File	Variable	Where to get it
.env	INDIAN_KANOON_API_TOKEN	api.indiankanoon.org
demo/.env	VITE_GROQ_API_KEY	console.groq.com
How It Works
User speaks or types a legal argument
Groq Whisper transcribes audio → LLaMA analyzes the text
Citations and articles are extracted and searched on Indian Kanoon
Each citation is checked for overruling (2-stage: keyword search → citation scan)
All citations are analyzed for contradictions by the LLM
Results are displayed with a live citation network graph
