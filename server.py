from flask import Flask, jsonify, request
from flask_cors import CORS
import http.client
import json
import os
import hashlib
import time
import urllib.parse
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)
CORS(app)

IK_TOKEN = os.environ.get("INDIAN_KANOON_API_TOKEN")
IK_HOST  = "api.indiankanoon.org"

# ── In-process cache: { key: (payload, unix_timestamp) } ────────────────────
_cache: dict = {}
CACHE_TTL = 3600  # 1 hour

def cache_get(key: str):
    if key in _cache:
        data, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None

def cache_set(key: str, data):
    _cache[key] = (data, time.time())

def cache_key(*parts) -> str:
    return hashlib.md5(':'.join(str(p) for p in parts).encode()).hexdigest()


# ── IK API helper ────────────────────────────────────────────────────────────
def call_ik_api(url: str):
    headers = {'Authorization': f'Token {IK_TOKEN}', 'Accept': 'application/json'}
    conn = http.client.HTTPSConnection(IK_HOST)
    conn.request('POST', url, headers=headers)
    resp = conn.getresponse()
    raw  = resp.read()
    if isinstance(raw, bytes):
        raw = raw.decode('utf8')
    return json.loads(raw)

def ik_search(query: str, maxpages: int = 1):
    q = urllib.parse.quote_plus(query.encode('utf8'))
    return call_ik_api(f'/search/?formInput={q}&pagenum=0&maxpages={maxpages}')

def ik_doc(docid: int, maxcitedby: int = 0, maxcites: int = 0):
    parts = []
    if maxcitedby: parts.append(f'maxcitedby={maxcitedby}')
    if maxcites:   parts.append(f'maxcites={maxcites}')
    qs = ('?' + '&'.join(parts)) if parts else ''
    return call_ik_api(f'/doc/{docid}/{qs}')

def ik_fragment(docid: int, query: str):
    q = urllib.parse.quote_plus(query.encode('utf8'))
    return call_ik_api(f'/docfragment/{docid}/?formInput={q}')


# ── Overruled-check helpers ──────────────────────────────────────────────────
OVERRULING_PHRASES = [
    'overruled', 'per incuriam', 'no longer good law',
    'expressly overruled', 'stands overruled', 'bad law',
]
HIGHER_COURTS = ['Supreme Court', 'SC', 'High Court', 'HC']

def _classify(evidence: list) -> tuple[str, str]:
    """Return (status, severity) from a list of evidence dicts."""
    if not evidence:
        return 'safe', 'SAFE'
    courts = [e.get('court', '') for e in evidence]
    if any(any(hc in c for hc in ['Supreme Court', ' SC ']) for c in courts):
        return 'overruled', 'HIGH'
    if any(any(hc in c for hc in HIGHER_COURTS) for c in courts):
        return 'possibly_overruled', 'MEDIUM'
    return 'possibly_overruled', 'LOW'


# ── Routes ───────────────────────────────────────────────────────────────────
@app.route('/api/search')
def search():
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    try:
        return jsonify(ik_search(query))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/doc/<int:docid>')
def get_doc(docid: int):
    maxcites   = request.args.get('maxcites',   0, type=int)
    maxcitedby = request.args.get('maxcitedby', 0, type=int)
    try:
        return jsonify(ik_doc(docid, maxcitedby=maxcitedby, maxcites=maxcites))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/check-overruled/<int:docid>')
def check_overruled(docid: int):
    """
    Two-stage overruling detection for a given case.
    Query params:
      name  – case name (used for Stage 1 keyword search)
    """
    case_name = request.args.get('name', '').strip()
    ck = cache_key('overruled', docid, case_name)
    cached = cache_get(ck)
    if cached:
        return jsonify(cached)

    result = {
        'docid': docid,
        'status': 'unknown',
        'severity': 'UNKNOWN',
        'evidence': [],
        'stage': None,
    }

    try:
        # ── Stage 1: fast keyword search ─────────────────────────────────────
        stage1_evidence = []
        for phrase in [f'overruled "{case_name}"', f'per incuriam "{case_name}"']:
            data = ik_search(phrase)
            for doc in (data.get('docs') or [])[:3]:
                stage1_evidence.append({
                    'title' : doc.get('title', ''),
                    'docid' : doc.get('tid'),
                    'date'  : doc.get('publishdate', ''),
                    'court' : doc.get('docsource', ''),
                    'phrase': phrase,
                })

        if stage1_evidence:
            result['stage']    = 1
            result['evidence'] = stage1_evidence
            status, severity   = _classify(stage1_evidence)
            result['status']   = status
            result['severity'] = severity
            cache_set(ck, result)
            return jsonify(result)

        # ── Stage 2: fetch citing docs, scan fragments ────────────────────────
        doc_data  = ik_doc(docid, maxcitedby=5)
        citedby   = doc_data.get('citedby') or []
        stage2_evidence = []

        for citing in citedby[:3]:
            citing_id = citing.get('tid')
            if not citing_id:
                continue
            for phrase in ['overruled', 'per incuriam']:
                try:
                    frag = ik_fragment(citing_id, phrase)
                    fragment_text = frag.get('fragment', '') or ''
                    lower = fragment_text.lower()
                    # Only count if the fragment also mentions the original case name
                    if fragment_text and (
                        case_name.lower() in lower or
                        any(p in lower for p in OVERRULING_PHRASES)
                    ):
                        stage2_evidence.append({
                            'title'   : citing.get('title', ''),
                            'docid'   : citing_id,
                            'date'    : citing.get('publishdate', ''),
                            'court'   : citing.get('docsource', ''),
                            'fragment': fragment_text[:400],
                            'phrase'  : phrase,
                        })
                        break  # one hit per citing doc is enough
                except Exception:
                    pass

        if stage2_evidence:
            result['stage']    = 2
            result['evidence'] = stage2_evidence
            status, severity   = _classify(stage2_evidence)
            result['status']   = status
            result['severity'] = severity
        else:
            result['stage']    = 2
            result['status']   = 'safe'
            result['severity'] = 'SAFE'

    except Exception as e:
        result['error'] = str(e)

    cache_set(ck, result)
    return jsonify(result)


if __name__ == '__main__':
    app.run(port=5000, debug=True)
