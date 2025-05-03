import logging
import json
import os
import re
import base64
import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv

from ikapi import FileStorage, IKApi, setup_logging

class LegalEntityExtractor:
    """Highly accurate legal entity extractor for Indian court cases"""
    
    def __init__(self):
        # Comprehensive regex pattern for Indian case names
        self.case_name_patterns = [
            # Standard "X v. Y" pattern with variations
            r'([A-Z][A-Za-z\s\.\,]+\s+v\.?\s+[A-Z][A-Za-z\s\.\,]+)',
            # "X versus Y" pattern
            r'([A-Z][A-Za-z\s\.\,]+\s+versus\s+[A-Z][A-Za-z\s\.\,]+)',
            # Handle "X vs Y" pattern (without period)
            r'([A-Z][A-Za-z\s\.\,]+\s+vs\s+[A-Z][A-Za-z\s\.\,]+)',
            # Pattern for cases with "and Another" or "& Anr."
            r'([A-Z][A-Za-z\s\.\,]+\s+(?:and|&)\s+(?:Another|Anr\.?|Ors\.?)\s+v\.?\s+[A-Z][A-Za-z\s\.\,]+)',
            # Pattern for cases with "and Others" or "& Ors."
            r'([A-Z][A-Za-z\s\.\,]+\s+(?:and|&)\s+(?:Others|Ors\.?)\s+v\.?\s+[A-Z][A-Za-z\s\.\,]+)',
            # Pattern for "M Siddiq v. Mahant Suresh Das" style
            r'([A-Z][A-Za-z\s\.\,]+\s*(?:\(D\))?\s*(?:Thr\s+Lrs\s+)?v[s]?\.?\s+[A-Z][A-Za-z\s\.\,]+)'
        ]
        
        # Comprehensive date patterns for Indian format
        self.date_patterns = [
            # DD-MM-YYYY with different separators
            r'(\d{1,2})[-./](\d{1,2})[-./](\d{4})',
            # DD Month YYYY format
            r'(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
            # Abbreviated month format: DD MMM YYYY
            r'(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})'
        ]
        
        # Month name to number mapping
        self.month_map = {
            'january': '01', 'jan': '01',
            'february': '02', 'feb': '02',
            'march': '03', 'mar': '03',
            'april': '04', 'apr': '04',
            'may': '05', 
            'june': '06', 'jun': '06',
            'july': '07', 'jul': '07',
            'august': '08', 'aug': '08',
            'september': '09', 'sep': '09', 'sept': '09',
            'october': '10', 'oct': '10',
            'november': '11', 'nov': '11',
            'december': '12', 'dec': '12'
        }

    def normalize_date(self, day: str, month: str, year: str) -> str:
        """Convert various date formats to DD-MM-YYYY format"""
        # Handle textual month names
        if month.lower() in self.month_map:
            month = self.month_map[month.lower()]
        
        # Ensure two digits for day and month
        day = day.zfill(2)
        month = month.zfill(2)
        
        return f"{day}-{month}-{year}"

    def extract_case_names(self, text: str) -> List[str]:
        """Extract case names using precise regex patterns"""
        case_names = []
        
        for pattern in self.case_name_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                case_name = match.group(1).strip()
                # Clean up extra whitespace and normalize
                case_name = re.sub(r'\s+', ' ', case_name)
                case_names.append(case_name)
        
        # Remove duplicates while preserving order
        seen = set()
        return [x for x in case_names if not (x in seen or seen.add(x))]

    def extract_dates(self, text: str) -> List[Dict[str, str]]:
        """Extract dates using precise regex patterns with context"""
        dates = []
        
        # Process standard numeric dates
        for match in re.finditer(self.date_patterns[0], text):
            day, month, year = match.groups()
            normalized_date = self.normalize_date(day, month, year)
            date_obj = {
                'original': match.group(0),
                'normalized': normalized_date,
                'context': self._get_date_context(text, match.start())
            }
            dates.append(date_obj)
        
        # Process worded month dates
        for pattern in self.date_patterns[1:]:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                day, month, year = match.groups()
                normalized_date = self.normalize_date(day, month, year)
                date_obj = {
                    'original': match.group(0),
                    'normalized': normalized_date,
                    'context': self._get_date_context(text, match.start())
                }
                dates.append(date_obj)
        
        return dates

    def _get_date_context(self, text: str, position: int, context_size: int = 100) -> str:
        """Extract context surrounding a date to determine relevance"""
        start = max(0, position - context_size)
        end = min(len(text), position + context_size)
        return text[start:end]

    def extract_entities(self, text: str) -> Dict[str, List]:
        """Extract all legal entities from text"""
        case_names = self.extract_case_names(text)
        dates = self.extract_dates(text)
        
        # Filter dates to those likely associated with cases
        case_related_dates = []
        date_normalized = []
        
        for date in dates:
            context = date['context'].lower()
            is_case_related = any([
                'dated' in context,
                'on' in context and any(case in context for case in ['case', 'judgment', 'decision']),
                'from' in context and any(case in context for case in ['case', 'judgment', 'decision']),
                any(case_name.lower() in context for case_name in case_names)
            ])
            
            if is_case_related:
                case_related_dates.append(date['original'])
                date_normalized.append(date['normalized'])
        
        return {
            "case_names": case_names,
            "dates": case_related_dates,
            "normalized_dates": date_normalized
        }


class CourtRoomAssistant:
    """Main class for the integrated courtroom assistant system"""
    
    def __init__(self, api_token, data_directory="legal_documents"):
        # Setup logging
        setup_logging('info')
        
        # Create directory for storing results
        self.data_directory = data_directory
        if not os.path.exists(self.data_directory):
            os.makedirs(self.data_directory)
        
        # Initialize components
        self.extractor = LegalEntityExtractor()
        self.file_storage = FileStorage(self.data_directory)
        
        # Setup IKApi
        class Args:
            def __init__(self):
                self.token = api_token
                self.maxcites = 10  # Get related citations
                self.maxcitedby = 10  # Get documents that cite this
                self.orig = True  # Get original court copy if available
                self.maxpages = 1
                self.pathbysrc = False
                self.numworkers = 1
                self.addedtoday = False
                self.fromdate = None
                self.todate = None
                self.sortby = None
        
        args = Args()
        self.ik_api = IKApi(args, self.file_storage)
        
        # Cache for documents we've already retrieved
        self.document_cache = {}

    def process_speech(self, speech_text):
        """
        Process speech text to extract cases and retrieve relevant documents
        Returns a list of retrieved documents
        """
        print("Processing speech text...")
        
        # Extract entities from speech
        entities = self.extractor.extract_entities(speech_text)
        
        if not entities["case_names"]:
            return {"success": False, "message": "No case names detected in the speech", "entities": entities}
        
        results = []
        
        # Process each case name
        for case_name in entities["case_names"]:
            print(f"Processing case: {case_name}")
            
            # Find matching date if available
            case_date = None
            if entities["normalized_dates"]:
                case_date = entities["normalized_dates"][0]
            
            # Retrieve document for this case
            document_result = self.retrieve_document(case_name, case_date)
            
            results.append(document_result)
        
        return {
            "success": True,
            "entities": entities,
            "results": results
        }

    def retrieve_document(self, case_name, date_str=None):
        """
        Retrieve document for a given case name and optional date
        Returns document info or error message
        """
        # Check if we've already retrieved this document
        cache_key = f"{case_name}_{date_str if date_str else 'nodate'}"
        if cache_key in self.document_cache:
            print(f"Retrieved document from cache: {cache_key}")
            return self.document_cache[cache_key]
            
        # Construct search query
        query = f'title: "{case_name}"'
        if date_str:
            query += f' fromdate: {date_str} todate: {date_str}'
        
        print(f"Searching for: {query}")
        
        # Perform the search
        search_results = self.ik_api.search(query, pagenum=0, maxpages=1)
        results_json = json.loads(search_results)
        
        # Process results
        if 'docs' in results_json and results_json['docs']:
            doc = results_json['docs'][0]  # Get the first matching document
            doc_id = doc['tid']
            
            print(f"Found document: ID: {doc_id}, Title: {doc['title']}")
            print(f"Source: {doc['docsource']}, Date: {doc['publishdate']}")
            
            # Create a specific directory for this document
            doc_dir = os.path.join(self.data_directory, f"{doc_id}")
            if not os.path.exists(doc_dir):
                os.makedirs(doc_dir)
            
            # Get document JSON
            jsonstr = self.ik_api.fetch_doc(doc_id)
            
            # Save JSON to file
            json_path = os.path.join(doc_dir, f"{doc_id}.json")
            
            try:
                with open(json_path, 'w', encoding='utf-8') as f:
                    f.write(jsonstr)
                print(f"Document JSON saved to {json_path}")
                
                # Get and save original document (PDF)
                orig_path = None
                pdf_path = None
                try:
                    print(f"Fetching original document for {doc_id}...")
                    orig_doc = self.ik_api.fetch_orig_doc(doc_id)
                    # Parse response and save original document
                    orig_obj = json.loads(orig_doc)
                    if 'errmsg' not in orig_obj:
                        orig_content = base64.b64decode(orig_obj['doc'])
                        extension = self.file_storage.get_file_extension(orig_obj['Content-Type'])
                        orig_path = os.path.join(doc_dir, f"{doc_id}_original.{extension}")
                        
                        with open(orig_path, 'wb') as f:
                            f.write(orig_content)
                        print(f"Original document saved to {orig_path}")
                        
                        # If it's a PDF, create a copy with .pdf extension
                        if extension == 'pdf':
                            pdf_path = os.path.join(doc_dir, f"{doc_id}.pdf")
                            with open(pdf_path, 'wb') as f:
                                f.write(orig_content)
                            print(f"PDF copy saved to {pdf_path}")
                    else:
                        print(f"Error getting original document: {orig_obj.get('errmsg', 'Unknown error')}")
                except Exception as e:
                    print(f"Error saving original document: {str(e)}")
                
                result = {
                    "success": True,
                    "document_id": doc_id,
                    "document_path": json_path,
                    "original_path": orig_path,
                    "pdf_path": pdf_path,
                    "title": doc['title'],
                    "date": doc['publishdate'],
                    "source": doc['docsource']
                }
                
                # Cache the result
                self.document_cache[cache_key] = result
                
                return result
            except Exception as e:
                error_msg = f"Error saving document: {str(e)}"
                print(error_msg)
                return {"success": False, "error": error_msg}
        else:
            error_msg = "No matching documents found"
            if 'errmsg' in results_json:
                error_msg = f"Error: {results_json['errmsg']}"
            
            print(error_msg)
            return {"success": False, "error": error_msg}


# Example usage
if __name__ == "__main__":
    # Load environment variables
    load_dotenv()

    # Get API token from environment variables
    indian_kanoon_token = os.environ.get("INDIAN_KANOON_API_TOKEN")
    
    if not indian_kanoon_token:
        print("Error: INDIAN_KANOON_API_TOKEN not found in environment variables")
        exit(1)
    
    # Initialize the assistant
    assistant = CourtRoomAssistant(indian_kanoon_token)
    
    # You could get this from a speech recognition system in a real application
    speech_text = input("Enter court speech text: ")
    
    # Process the speech
    result = assistant.process_speech(speech_text)
    
    # Display results
    print("\n===== PROCESSING RESULTS =====")
    
    if "entities" in result:
        print("\nDetected Case Names:")
        for case in result["entities"]["case_names"]:
            print(f"- {case}")
        
        print("\nDetected Dates:")
        for date in result["entities"]["dates"]:
            print(f"- {date}")
    
    if "results" in result and result["success"]:
        print("\n===== RETRIEVED DOCUMENTS =====")
        
        for i, doc_result in enumerate(result["results"], 1):
            print(f"\nDocument {i}:")
            if doc_result["success"]:
                print(f"Title: {doc_result['title']}")
                print(f"Date: {doc_result['date']}")
                print(f"Source: {doc_result['source']}")
                print(f"JSON saved at: {doc_result['document_path']}")
                
                if 'pdf_path' in doc_result and doc_result['pdf_path']:
                    print(f"PDF saved at: {doc_result['pdf_path']}")
                elif 'original_path' in doc_result and doc_result['original_path']:
                    print(f"Original file saved at: {doc_result['original_path']}")
                else:
                    print("No original document/PDF available")
            else:
                print(f"Error: {doc_result['error']}")
    
    elif not result["success"]:
        print(f"\nError: {result['message']}")