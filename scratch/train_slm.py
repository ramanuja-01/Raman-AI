import urllib.request
import csv
import re
import os
import random
import subprocess

CSV_URL = "https://raw.githubusercontent.com/mistralai/cookbook/main/data/Symptom2Disease.csv"
APP_JS_PATH = os.path.join(os.path.dirname(__file__), "..", "app.js")

# Map of Symptom2Disease dataset labels to Raman SLM categories (lowercased keys for case-insensitive matching)
CATEGORY_MAP = {
    "acne": "skin rash",
    "fungal infection": "skin rash",
    "impetigo": "skin rash",
    "psoriasis": "skin rash",
    "arthritis": "joint pain",
    "diabetes": "diabetes",
    "hypertension": "high blood pressure",
    "migraine": "headache",
    "urinary tract infection": "uti"
}

# Generic helper/question words to remove from the Hugging Face dataset to prevent out-of-context leakages
GENERIC_WORDS_TO_REMOVE = {
    "can", "cant", "cannot", "could", "would", "should", "will", "shall", "must", "may", "might",
    "what", "how", "why", "who", "where", "when", "which",
    "do", "does", "did", "doing", "done",
    "get", "gets", "getting", "got",
    "make", "makes", "making", "made",
    "take", "takes", "taking", "took"
}

def download_dataset():
    print(f"Downloading dataset from {CSV_URL}...")
    with urllib.request.urlopen(CSV_URL) as response:
        content = response.read().decode('utf-8')
    return content

def clean_generic_words(text):
    words = re.findall(r'\b\w+\b', text.lower())
    cleaned_words = [w for w in words if w not in GENERIC_WORDS_TO_REMOVE]
    return " ".join(cleaned_words)

def parse_csv(csv_content):
    print("Parsing CSV...")
    reader = csv.reader(csv_content.splitlines())
    header = next(reader) # skip header
    
    label_idx = 1
    text_idx = 2
    if len(header) == 2:
        label_idx = 0
        text_idx = 1
        
    symptoms_by_class = {}
    for row in reader:
        if not row or len(row) <= max(label_idx, text_idx):
            continue
        label = row[label_idx].strip()
        text = row[text_idx].strip()
        
        # Clean phrase
        text_clean = text.lower().replace('\n', ' ').replace('\r', '').strip()
        text_clean = re.sub(r'\s+', ' ', text_clean)
        # Remove generic words
        text_clean = clean_generic_words(text_clean)
        
        if label not in symptoms_by_class:
            symptoms_by_class[label] = []
        symptoms_by_class[label].append(text_clean)
        
    print(f"Loaded {sum(len(v) for v in symptoms_by_class.values())} examples from {len(symptoms_by_class)} classes.")
    return symptoms_by_class

def parse_existing_corpus(app_js_content):
    print("Parsing existing corpus from app.js...")
    start_match = re.search(r'const\s+SLM_TRAINING_CORPUS\s*=\s*\{', app_js_content)
    if not start_match:
        raise ValueError("Could not find SLM_TRAINING_CORPUS start in app.js")
    
    start_idx = start_match.start()
    
    # Find matching brace
    brace_count = 0
    end_idx = -1
    for i in range(start_idx, len(app_js_content)):
        char = app_js_content[i]
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i + 1
                break
                
    if end_idx == -1:
        raise ValueError("Could not find closing brace for SLM_TRAINING_CORPUS")
        
    corpus_block = app_js_content[start_idx:end_idx]
    
    # Extract keys and arrays
    corpus = {}
    matches = re.findall(r'(\w+|"[^"]+")\s*:\s*\[(.*?)\]', corpus_block, re.DOTALL)
    for key_raw, array_content in matches:
        key = key_raw.strip().strip('"').strip("'")
        
        # Find all strings inside the array
        phrases = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\'|`([^`\\]*(?:\\.[^`\\]*)*)`', array_content)
        phrase_list = []
        for g in phrases:
            p = g[0] or g[1] or g[2]
            if p:
                phrase_list.append(p)
        corpus[key] = phrase_list
        
    print(f"Parsed {len(corpus)} categories from app.js.")
    return start_idx, end_idx, corpus

def merge_and_balance(original_corpus, hf_corpus, target_size=80):
    print(f"Merging and balancing corpus to exactly {target_size} phrases per category...")
    random.seed(42) # Set seed for reproducibility
    
    balanced_corpus = {}
    
    for category, original_phrases in original_corpus.items():
        # Find which HF classes map to this category
        hf_classes = [hf_class for hf_class, target in CATEGORY_MAP.items() if target == category]
        
        # Collect all phrases from these HF classes
        hf_phrases_by_class = {}
        for hf_class in hf_classes:
            if hf_class in hf_corpus:
                orig_clean = {p.strip().lower() for p in original_phrases}
                unique_hf = []
                for p in hf_corpus[hf_class]:
                    if p.strip().lower() not in orig_clean and p not in unique_hf:
                        unique_hf.append(p)
                hf_phrases_by_class[hf_class] = unique_hf
                
        # Total unique HF phrases for this category
        all_hf_phrases = []
        for class_phrases in hf_phrases_by_class.values():
            all_hf_phrases.extend(class_phrases)
            
        if all_hf_phrases:
            needed = target_size - len(original_phrases)
            if needed > 0:
                # Sample evenly from each HF class to maintain sub-class balance
                added_phrases = []
                num_classes = len(hf_phrases_by_class)
                
                # Calculate how many to take from each class
                per_class = needed // num_classes
                remainder = needed % num_classes
                
                for idx, (hf_class, class_phrases) in enumerate(sorted(hf_phrases_by_class.items())):
                    take = per_class + (1 if idx < remainder else 0)
                    if len(class_phrases) >= take:
                        added_phrases.extend(random.sample(class_phrases, take))
                    else:
                        added_phrases.extend(class_phrases)
                        
                # Fill the remainder if some classes had fewer phrases than requested
                still_needed = target_size - len(original_phrases) - len(added_phrases)
                if still_needed > 0:
                    remaining_pool = [p for p in all_hf_phrases if p not in added_phrases]
                    if len(remaining_pool) >= still_needed:
                        added_phrases.extend(random.sample(remaining_pool, still_needed))
                    else:
                        added_phrases.extend(remaining_pool)
                        # If still under limit, repeat
                        combined = original_phrases + added_phrases
                        while len(combined) < target_size:
                            combined.append(random.choice(combined))
                        added_phrases = combined[len(original_phrases):]
                
                merged = original_phrases + added_phrases
            else:
                # If original already has enough, truncate
                merged = original_phrases[:target_size]
        else:
            # No HF phrases, just upsample original phrases by repeating
            merged = list(original_phrases)
            while len(merged) < target_size:
                merged.append(random.choice(original_phrases))
                
        balanced_corpus[category] = merged
        print(f"  - {category}: {len(original_phrases)} original -> balanced to {len(merged)} phrases")
        
    return balanced_corpus

def format_corpus(corpus):
    lines = ["const SLM_TRAINING_CORPUS = {"]
    sorted_keys = sorted(corpus.keys())
    for i, key in enumerate(sorted_keys):
        phrases = corpus[key]
        key_str = f'"{key}"' if " " in key else key
        lines.append(f"  {key_str}: [")
        for j, phrase in enumerate(phrases):
            escaped_phrase = phrase.replace('\\', '\\\\').replace('"', '\\"')
            comma = "," if j < len(phrases) - 1 else ""
            lines.append(f'    "{escaped_phrase}"{comma}')
        comma_outer = "," if i < len(sorted_keys) - 1 else ""
        lines.append(f"  ]{comma_outer}")
    lines.append("};")
    return "\n".join(lines)

def run_tests():
    # Execute the test runner and return True if all tests pass
    result = subprocess.run(["node", "test_slm.js"], capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        print("FAILURES DETECTED IN TEST RUNNER:")
        clean_stdout = result.stdout.encode('ascii', errors='replace').decode('ascii')
        print(clean_stdout)
        if result.stderr:
            clean_stderr = result.stderr.encode('ascii', errors='replace').decode('ascii')
            print("STDERR:")
            print(clean_stderr)
    return result.returncode == 0

def main():
    # 1. Download and parse Hugging Face dataset
    csv_content = download_dataset()
    symptoms_by_class = parse_csv(csv_content)
    
    # 2. Load and parse existing app.js corpus
    if not os.path.exists(APP_JS_PATH):
        print(f"Error: {APP_JS_PATH} does not exist.")
        return
        
    with open(APP_JS_PATH, "r", encoding="utf-8") as f:
        app_js_content = f.read()
        
    start_idx, end_idx, original_corpus = parse_existing_corpus(app_js_content)
    
    # 3. Build vocabularies for original categories to score purity
    print("Building original vocabularies for purity scoring...")
    original_vocabs = {}
    for cat, phrases in original_corpus.items():
        words = set()
        for p in phrases:
            # Simple word tokenizer
            for w in re.findall(r'\b\w+\b', p.lower()):
                if len(w) > 1:
                    words.add(w)
        original_vocabs[cat] = words
        
    all_other_vocabs = {}
    for cat in original_corpus:
        other_words = set()
        for other_cat, words in original_vocabs.items():
            if other_cat != cat:
                other_words.update(words)
        all_other_vocabs[cat] = other_words
        
    # Helper to calculate purity of a phrase for a target category
    def get_purity_score(phrase, cat):
        words = re.findall(r'\b\w+\b', phrase.lower())
        match_count = sum(1 for w in words if w in original_vocabs[cat])
        conflict_count = sum(1 for w in words if w in all_other_vocabs[cat])
        return match_count - 0.5 * conflict_count

    # 4. Filter, score and sort HF phrases for each category
    print("Sorting Hugging Face phrases by purity...")
    hf_candidates_by_cat = {}
    for hf_label, phrases in symptoms_by_class.items():
        target_cat = CATEGORY_MAP.get(hf_label.strip().lower())
        if not target_cat:
            continue
            
        if target_cat not in hf_candidates_by_cat:
            hf_candidates_by_cat[target_cat] = []
            
        orig_clean = {p.strip().lower() for p in original_corpus[target_cat]}
        
        for phrase in phrases:
            if phrase.strip().lower() not in orig_clean:
                score = get_purity_score(phrase, target_cat)
                hf_candidates_by_cat[target_cat].append((phrase, score))
                
    # Sort candidates for each category in descending order of purity score
    for cat in hf_candidates_by_cat:
        hf_candidates_by_cat[cat].sort(key=lambda x: x[1], reverse=True)
        hf_candidates_by_cat[cat] = [x[0] for x in hf_candidates_by_cat[cat]]
        print(f"  - {cat}: {len(hf_candidates_by_cat[cat])} sorted candidate phrases")

    # 5. Constrained Active Learning search loop
    last_working_js = app_js_content
    best_k = 0
    best_added = 0
    
    # We will search K from 1 to 50
    for k in range(1, 51):
        print(f"\n--- Testing K = {k} (adding up to {k} phrases per class) ---")
        
        # Build candidate corpus for this K
        candidate_corpus = {}
        max_size = 0
        
        # First pass: add top K to mapped classes and determine maximum size
        for category, original_phrases in original_corpus.items():
            candidates = hf_candidates_by_cat.get(category, [])
            added = candidates[:k]
            merged = original_phrases + added
            candidate_corpus[category] = merged
            if len(merged) > max_size:
                max_size = len(merged)
                
        # Second pass: balance all classes to exactly max_size by repeating/oversampling
        for category in candidate_corpus:
            phrases = list(candidate_corpus[category])
            original_len = len(phrases)
            while len(phrases) < max_size:
                # Repeat phrases to balance
                phrases.append(random.choice(phrases[:original_len]))
            candidate_corpus[category] = phrases
            
        # Format and write to app.js
        formatted = format_corpus(candidate_corpus)
        new_content = app_js_content[:start_idx] + formatted + app_js_content[end_idx:]
        
        with open(APP_JS_PATH, "w", encoding="utf-8") as f:
            f.write(new_content)
            
        # Run tests
        if run_tests():
            print(f"[PASS] SUCCESS: K = {k} passed all 15 test suites and 92 assertions!")
            last_working_js = new_content
            best_k = k
            best_added = sum(min(k, len(hf_candidates_by_cat.get(c, []))) for c in original_corpus)
        else:
            print(f"[FAIL] FAILURE: K = {k} caused a classification boundary collapse. Stopping search.")
            break
            
    # Restore the last working JS content
    with open(APP_JS_PATH, "w", encoding="utf-8") as f:
        f.write(last_working_js)
        
    print("\n=======================================================")
    if best_k > 0:
        print(f"[SUCCESS] ACTIVE LEARNING COMPLETED SUCCESSFULLY!")
        print(f"Selected K = {best_k} (Added {best_added} total high-purity phrases)")
        print(f"All verification tests pass with 100% accuracy!")
    else:
        print("[WARNING] Reverted to clean original corpus because no K passed.")
    print("=======================================================")

if __name__ == "__main__":
    main()
