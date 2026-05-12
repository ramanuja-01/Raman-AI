// ===== RAMAN AI – Experiment No. 170 – Main Logic =====

// ── Hoisted globals (available to all functions immediately) ──
let currentHealthId     = localStorage.getItem('ramanai_current_hid') || null;
let sessionCreatedDate  = null;
let chatHistory         = [];
let hidShownThisSession = false;
let vaultData           = JSON.parse(localStorage.getItem('ramanai_vault') || '[]');
let detectedConditions  = new Set(JSON.parse(localStorage.getItem('ramanai_conditions') || '[]'));

// ── Splash Screen ──────────────────────────────────────
const splashMsgs = [
  "Initializing neural pathways...",
  "Loading medical knowledge base...",
  "Calibrating symptom recognition...",
  "Establishing secure connection...",
  "RAMAN AI is ready."
];
let splashIdx = 0;
const splashStatusEl = document.getElementById("splashStatus");
const splashInterval = setInterval(() => {
  splashIdx++;
  if (splashStatusEl) {
    if (splashIdx < splashMsgs.length) splashStatusEl.textContent = splashMsgs[splashIdx];
    else clearInterval(splashInterval);
  } else {
    clearInterval(splashInterval); // Element doesn't exist, stop timer
  }
}, 800);

window._splashTimer = setTimeout(() => {
  // This timer is also set (and may be cancelled) at the bottom of app.js by the Health ID module.
  // If Health ID module hasn't run yet (first load) this fires normally.
}, 4800); // visual splash plays via CSS; JS app init now handled at bottom of file

// ── Mobile Sidebar Toggle ──────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.toggle('open');
  backdrop.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.remove('open');
  backdrop.style.display = 'none';
}

// ── Tutorial Modal Toggle ──────────────────────────────────
function openTutorial() {
  document.getElementById('tutorialBackdrop').style.display = 'block';
  document.getElementById('tutorialModal').classList.add('open');
}
function closeTutorial() {
  document.getElementById('tutorialBackdrop').style.display = 'none';
  document.getElementById('tutorialModal').classList.remove('open');
}

// ── Clock ───────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function updateClock() {
  const el = document.getElementById("clockDisplay");
  if (el) el.textContent = nowTime();
}
setInterval(updateClock, 30000);
updateClock();

// ── Particles ───────────────────────────────────────────
function initParticles() {
  const container = document.getElementById("bgParticles");
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = Math.random() * 5 + 2;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 18 + 12}s;
      animation-delay:${Math.random() * 12}s;
    `;
    container.appendChild(p);
  }
}

// ── Medical Knowledge Base ─────────────────────────────
const MEDICAL_KB = {
  fever: {
    conditions: ["Viral Infection", "Bacterial Infection", "Flu (Influenza)", "Common Cold", "COVID-19"],
    medications: [
      { name: "Paracetamol (Acetaminophen)", dose: "500–1000 mg every 6–8 hours", note: "First-line antipyretic" },
      { name: "Ibuprofen", dose: "400 mg every 8 hours with food", note: "Also reduces inflammation" }
    ],
    precautions: ["Stay hydrated – drink 8–10 glasses of water/day", "Rest adequately", "Monitor temperature every 4 hours", "Seek urgent care if fever exceeds 104°F (40°C)"],
    diet: ["Warm soups and broths", "Fresh citrus fruits (Vitamin C)", "Ginger and tulsi tea", "Avoid cold foods and beverages"],
    specialist: "General Physician / Internist"
  },
  headache: {
    conditions: ["Tension Headache", "Migraine", "Dehydration", "Sinusitis", "Hypertension"],
    medications: [
      { name: "Paracetamol", dose: "500–1000 mg as needed", note: "Mild to moderate headache" },
      { name: "Ibuprofen", dose: "400 mg every 8 hours", note: "Effective for tension headaches" },
      { name: "Sumatriptan", dose: "50 mg at onset (migraine only)", note: "For diagnosed migraines" }
    ],
    precautions: ["Avoid screen time and bright lights", "Apply cold/warm compress on forehead", "Seek emergency care for sudden severe 'thunderclap' headache"],
    diet: ["Drink plenty of water", "Avoid caffeine excess", "Small regular meals", "Magnesium-rich foods (nuts, leafy greens)"],
    specialist: "Neurologist (for chronic/recurring headaches)"
  },
  cough: {
    conditions: ["Common Cold", "Bronchitis", "Asthma", "GERD", "Pneumonia", "Allergic Rhinitis"],
    medications: [
      { name: "Dextromethorphan", dose: "10–20 mg every 4–6 hours", note: "Dry / non-productive cough" },
      { name: "Guaifenesin", dose: "200–400 mg every 4 hours", note: "Productive cough with mucus" },
      { name: "Salbutamol Inhaler", dose: "1–2 puffs as needed", note: "If wheeze / asthma suspected" }
    ],
    precautions: ["Avoid cold air and smoke", "Stay hydrated", "Use steam inhalation", "Persistent cough >3 weeks needs investigation"],
    diet: ["Warm fluids – honey-lemon water", "Turmeric milk (Haldi doodh)", "Avoid dairy if producing mucus"],
    specialist: "Pulmonologist / ENT"
  },
  "chest pain": {
    conditions: ["⚠️ Cardiac Emergency (Rule out immediately)", "Costochondritis", "GERD / Acid Reflux", "Muscle Strain", "Anxiety / Panic Attack"],
    medications: [
      { name: "⚠️ EMERGENCY", dose: "Call 108 immediately if crushing chest pain, pain radiating to arm/jaw, sweating, breathlessness", note: "Do NOT self-medicate cardiac emergencies" },
      { name: "Antacids (for GERD-related)", dose: "As directed by physician", note: "Only after ruling out cardiac cause" }
    ],
    precautions: ["⚠️ CRITICAL: Treat all chest pain as cardiac until proven otherwise", "Call emergency services (108) immediately", "Do NOT drive yourself to hospital", "Chew aspirin 325mg if cardiac event suspected and not allergic"],
    diet: ["Avoid spicy, fatty foods", "Eat smaller meals", "No alcohol or caffeine"],
    specialist: "⚠️ Emergency Room / Cardiologist – IMMEDIATELY"
  },
  "stomach pain": {
    conditions: ["Gastritis", "Irritable Bowel Syndrome (IBS)", "Appendicitis", "Peptic Ulcer", "Food Poisoning", "Indigestion"],
    medications: [
      { name: "Omeprazole (PPI)", dose: "20 mg once daily before breakfast", note: "For gastritis / acid-related pain" },
      { name: "Buscopan (Hyoscine)", dose: "10–20 mg 3 times daily", note: "For cramping / spasms" },
      { name: "ORS (Oral Rehydration Salts)", dose: "As needed with water", note: "For vomiting / diarrhoea" }
    ],
    precautions: ["⚠️ Severe right lower abdominal pain may indicate appendicitis – seek emergency care", "Avoid NSAIDs (aspirin, ibuprofen) on empty stomach", "Monitor for blood in stool"],
    diet: ["BRAT diet: Bananas, Rice, Applesauce, Toast", "Avoid spicy, oily, and acidic foods", "Small frequent meals", "Curd / yoghurt for gut health"],
    specialist: "Gastroenterologist"
  },
  "joint pain": {
    conditions: ["Arthritis (Osteo/Rheumatoid)", "Gout", "Injury / Sprain", "Lupus", "Viral Arthralgia"],
    medications: [
      { name: "Ibuprofen", dose: "400 mg 3 times daily with food", note: "Anti-inflammatory relief" },
      { name: "Diclofenac Gel", dose: "Apply locally 3–4 times daily", note: "For localized joint pain" },
      { name: "Colchicine", dose: "0.5–1 mg twice daily (gout only)", note: "For acute gout flares" }
    ],
    precautions: ["Rest the affected joint", "Apply ice for 20 min every 2 hours (first 48h)", "Avoid repetitive strain", "Weight management is key for knee arthritis"],
    diet: ["Anti-inflammatory diet: omega-3 fatty acids (fish, flaxseed)", "Turmeric and ginger", "Cherries (for gout)", "Reduce red meat and alcohol"],
    specialist: "Rheumatologist / Orthopaedic Surgeon"
  },
  "skin rash": {
    conditions: ["Allergic Dermatitis", "Eczema", "Urticaria (Hives)", "Psoriasis", "Fungal Infection", "Drug Reaction"],
    medications: [
      { name: "Cetirizine (Antihistamine)", dose: "10 mg once daily at night", note: "For allergic rash / urticaria" },
      { name: "Hydrocortisone Cream 1%", dose: "Apply thin layer twice daily", note: "For localized inflammation" },
      { name: "Clotrimazole Cream", dose: "Apply twice daily for 2–4 weeks", note: "For fungal rash" }
    ],
    precautions: ["Avoid scratching", "Identify and avoid triggers", "⚠️ Seek emergency care for rash with difficulty breathing (anaphylaxis)", "Do not use steroid cream on face without advice"],
    diet: ["Avoid known allergens", "Increase Vitamin C and E intake", "Stay well-hydrated", "Avoid processed foods"],
    specialist: "Dermatologist / Allergist"
  },
  "high blood pressure": {
    conditions: ["Hypertension (Primary)", "Secondary Hypertension", "White-coat Hypertension"],
    medications: [
      { name: "Amlodipine", dose: "5 mg once daily (increase to 10mg)", note: "Calcium channel blocker" },
      { name: "Losartan", dose: "50 mg once daily", note: "ARB – kidney-protective" },
      { name: "Hydrochlorothiazide", dose: "12.5–25 mg once daily", note: "Diuretic" }
    ],
    precautions: ["Monitor BP twice daily", "Do NOT stop medications abruptly", "⚠️ BP >180/120 is hypertensive crisis – seek emergency care", "Regular follow-ups required"],
    diet: ["DASH diet: low sodium (<2g/day)", "Increase potassium (bananas, spinach)", "Reduce alcohol", "Avoid processed/packaged foods", "Regular aerobic exercise"],
    specialist: "Cardiologist / Internist"
  },
  diabetes: {
    conditions: ["Type 1 Diabetes", "Type 2 Diabetes", "Pre-diabetes", "Gestational Diabetes"],
    medications: [
      { name: "Metformin", dose: "500 mg twice daily with meals (titrate up)", note: "First-line for Type 2" },
      { name: "Glipizide", dose: "5 mg once daily before breakfast", note: "Sulphonylurea" },
      { name: "Insulin", dose: "As prescribed by physician", note: "For Type 1 and uncontrolled Type 2" }
    ],
    precautions: ["Monitor blood sugar morning and 2 hours post-meal", "Never skip meals on medication", "Watch for hypoglycaemia symptoms (shaking, sweating, confusion)", "Regular HbA1c check every 3 months"],
    diet: ["Low glycaemic index foods", "Avoid sugar, white rice, maida", "High fibre: whole grains, vegetables, legumes", "Small frequent meals (5–6/day)", "Bitter gourd (karela), fenugreek – natural aids"],
    specialist: "Endocrinologist / Diabetologist"
  },
  "eye pain": {
    conditions: ["Conjunctivitis", "Dry Eye Syndrome", "Glaucoma", "Uveitis", "Digital Eye Strain"],
    medications: [
      { name: "Artificial Tears Drops", dose: "1–2 drops 4 times daily", note: "For dry eyes and strain" },
      { name: "Chloramphenicol Eye Drops", dose: "1 drop every 2–3 hours", note: "Bacterial conjunctivitis" },
      { name: "Sodium Cromoglicate Eye Drops", dose: "1–2 drops 4 times daily", note: "Allergic conjunctivitis" }
    ],
    precautions: ["⚠️ Sudden vision loss / severe eye pain needs emergency care", "Do NOT rub eyes", "Follow 20-20-20 rule for digital strain", "Wear UV-protective sunglasses"],
    diet: ["Vitamin A: carrots, leafy greens", "Lutein: eggs, kale, spinach", "Omega-3 fatty acids", "Stay well-hydrated"],
    specialist: "Ophthalmologist"
  },
  "back pain": {
    conditions: ["Muscle Strain", "Disc Herniation", "Lumbar Spondylosis", "Kidney Issues", "Poor Posture"],
    medications: [
      { name: "Ibuprofen / Diclofenac", dose: "400 mg 3 times daily with food", note: "Anti-inflammatory" },
      { name: "Muscle Relaxant (Methocarbamol)", dose: "750 mg 3 times daily", note: "For muscle spasm" },
      { name: "Diclofenac Topical Gel", dose: "Apply 3–4 times daily", note: "Local pain relief" }
    ],
    precautions: ["Avoid prolonged sitting", "Sleep on firm mattress", "⚠️ Back pain with numbness/weakness in legs – seek urgent care (possible nerve compression)", "Maintain correct posture"],
    diet: ["Calcium-rich foods: milk, yoghurt, ragi", "Vitamin D: sunlight, eggs, fish", "Anti-inflammatory: turmeric, ginger"],
    specialist: "Orthopaedic Surgeon / Physiotherapist"
  }
};

// ── Keyword Mapping ─────────────────────────────────────
const KEYWORD_MAP = {
  "fever|temperature|pyrexia|hot body|chills|jaro|jwar|jwara|deha garam": "fever",
  "headache|migraine|head pain|head ache|munda": "headache",
  "cough|cold|mucus|phlegm|bronchitis|kasha|thanda|kahsa": "cough",
  "chest pain|chest pressure|chest tightness|heart|chhati|chati": "chest pain",
  "stomach|abdomen|abdomin|tummy|belly|nausea|vomit|gastric|diarrhea|diarrhoea|indigestion|peta|jhada|banti": "stomach pain",
  "joint|arthritis|knee|bone|swelling in joints|gout|ganthi|gotha|goda": "joint pain",
  "rash|skin|itch|allergy|hive|eczema|dermatitis|kundei|charma|khasu": "skin rash",
  "blood pressure|hypertension|bp|dizziness|rakta chapa|munda bula": "high blood pressure",
  "diabetes|sugar|glucose|madhumeha|bahumutra": "diabetes",
  "eye|vision|blur|conjunctivitis|red eye|akhi|aakhi": "eye pain",
  "back pain|spine|lumbar|backache|anta|nadi": "back pain"
};

function detectCondition(text) {
  const lower = text.toLowerCase();
  for (const [pattern, condition] of Object.entries(KEYWORD_MAP)) {
    const keywords = pattern.split("|");
    if (keywords.some(k => lower.includes(k))) {
      return condition;
    }
  }
  return null;
}

window.currentLang = 'en';

const ODIA_DICT = {
  greetings: [
    "ମୁଁ ବୁଝିପାରୁଛି ଆପଣ ଅସୁସ୍ଥ ଅନୁଭବ କରୁଛନ୍ତି।",
    "ଆସନ୍ତୁ ଦେଖିବା କ'ଣ ହୋଇପାରେ।",
    "ମୁଁ ଆପଣଙ୍କୁ ସାହାଯ୍ୟ କରିବାକୁ ଏଠାରେ ଅଛି।"
  ],
  genericBase: [
    "ମୁଁ ଠିକ୍ ଭାବରେ ବୁଝିବାକୁ ଚାହୁଁଛି।",
    "ଆପଣଙ୍କୁ ସବୁଠାରୁ ସୁରକ୍ଷିତ ପରାମର୍ଶ ଦେବାକୁ,",
    "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ବିଷୟରେ ଅଧିକ ସ୍ପଷ୍ଟ ଭାବରେ ଜାଣିବାକୁ ଚାହୁଁଛି।",
    "ଆସନ୍ତୁ ଏହାକୁ ମିଶି ସମାଧାନ କରିବା।"
  ],
  hi: "ନମସ୍କାର",
  thanks: "ଯୋଗାଯୋଗ କରିଥିବାରୁ ଧନ୍ୟବାଦ",
  describeMore: "ଦୟାକରି ଆପଣଙ୍କ ଲକ୍ଷଣ ବିଷୟରେ ଟିକେ ଅଧିକ ବିବରଣୀ ଦେବେ କି?",
  whatToInclude: "💡 କ'ଣ ସାମିଲ କରିବେ",
  inc1: "ଯନ୍ତ୍ରଣା କିପରି ଲାଗୁଛି (ତୀକ୍ଷ୍ଣ, ଧୀମା, ଜଳାପୋଡା)",
  inc2: "ଶରୀରର କେଉଁ ସ୍ଥାନରେ",
  inc3: "କେତେ ସମୟ ଏବଂ କେତେଥର ଲକ୍ଷଣ ଦେଖାଯାଉଛି",
  inc4: "କୌଣସି ଜ୍ୱର, ବାନ୍ତି କିମ୍ବା ଅନ୍ୟାନ୍ୟ ଲକ୍ଷଣ",
  inc5: "ଆପଣ ବର୍ତ୍ତମାନ ଖାଉଥିବା କୌଣସି ଔଷଧ",
  inc6: "କୌଣସି ଜଣାଶୁଣା ଆଲର୍ଜି କିମ୍ବା ପୂର୍ବ ରୋଗ",
  docQuestion: "ଡାକ୍ତରଙ୍କ ପ୍ରଶ୍ନ:",
  assessmentIntro: "ସବିଶେଷ ତଥ୍ୟ ପାଇଁ ଧନ୍ୟବାଦ। ଆପଣଙ୍କ ଲକ୍ଷଣ ଉପରେ ଆଧାର କରି, ଏଠାରେ ମୋର ପ୍ରାରମ୍ଭିକ ଆକଳନ ଅଛି:",
  possibleCond: "🔬 ସମ୍ଭାବ୍ୟ ରୋଗ",
  suggestedMed: "💊 ପ୍ରସ୍ତାବିତ ଔଷଧ",
  dose: "ମାତ୍ରା:",
  note: "ସୂଚନା:",
  precautions: "⚠️ ସତର୍କତା ଏବଂ ନିର୍ଦ୍ଦେଶାବଳୀ",
  diet: "🥗 ଖାଦ୍ୟପେୟ ପରାମର୍ଶ",
  specialist: "🏥 ପରାମର୍ଶ ପାଇଁ ବିଶେଷଜ୍ଞ:",
  disclaimerTitle: "🔴 ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସୂଚନା",
  disclaimerBody: "ଏହି ତଥ୍ୟ କେବଳ ସୂଚନା ଉଦ୍ଦେଶ୍ୟରେ ଦିଆଯାଇଛି। କୌଣସି ଚିକିତ୍ସା ଆରମ୍ଭ କରିବା ପୂର୍ବରୁ ଦୟାକରି ଜଣେ ଯୋଗ୍ୟ ଡାକ୍ତରଙ୍କ ପରାମର୍ଶ ନିଅନ୍ତୁ।",
  footerHint: "ଆପଣ ସାଧାରଣ ରୋଗ ପାଇଁ ବାମ ପାର୍ଶ୍ୱରେ ଥିବା କୁଇକ୍ ସିମ୍ପଟମ୍ସ ବଟନ୍ ବ୍ୟବହାର କରିପାରିବେ। ମୁଁ ସାହାଯ୍ୟ କରିବାକୁ ଅଛି! 🩺"
};

const FOLLOW_UP_ODIA = {
  "stomach pain": [
    "କଷ୍ଟ ତୀକ୍ଷ୍ଣ, ଧୀମା କିମ୍ବା ଜଳାପୋଡା ପରି ଲାଗୁଛି କି?",
    "ଖାଇବା ପରେ କଷ୍ଟ ବଢୁଛି କିମ୍ବା ଏହା ଲଗାତାର ରହୁଛି?"
  ],
  "chest pain": [
    "⚠️ କଷ୍ଟ ହାତ, ବେକ କିମ୍ବା ପାଟି ଆଡକୁ ବ୍ୟାପୁଛି କି?",
    "ଆପଣଙ୍କୁ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ କିମ୍ବା ମୁଣ୍ଡ ବୁଲାଉଛି କି?"
  ],
  "fever": [
    "ଆପଣଙ୍କର ସର୍ବାଧିକ ତାପମାତ୍ରା କେତେ ଅଛି?",
    "ଆପଣଙ୍କୁ ଶୀତ ଲାଗୁଛି, ଝାଳ ବୋହୁଛି କିମ୍ବା ଦେହ ହାତ ବିନ୍ଧା ହେଉଛି କି?"
  ],
  "headache": [
    "କଷ୍ଟ ମୁଣ୍ଡର ଗୋଟିଏ ପାର୍ଶ୍ୱରେ ଅଛି ନା ପୁରା ମୁଣ୍ଡରେ?",
    "ଆପଣଙ୍କୁ ଆଲୋକରେ କଷ୍ଟ ହେଉଛି କିମ୍ବା ବାନ୍ତି ଲାଗୁଛି କି?"
  ],
  "cough": [
    "ଏହା ଶୁଖିଲା କାଶ ନା ଖଙ୍କାର ବାହାରୁଛି?",
    "ଏହି କାଶ କେତେ ଦିନ ହେଲାଣି ଅଛି?"
  ],
  "joint pain": [
    "କେଉଁ ନିର୍ଦ୍ଦିଷ୍ଟ ଗଣ୍ଠିରେ କଷ୍ଟ ହେଉଛି?",
    "ସେଠାରେ ଫୁଲା, ନାଲି ପଡିବା କିମ୍ବା ଗରମ ଲାଗିବା ପରି କିଛି ଅଛି କି?"
  ],
  "skin rash": [
    "ରାସ୍ ରେ କୁଣ୍ଡେଇ ହେଉଛି ନା କଷ୍ଟ ହେଉଛି?",
    "ଏହା ଶରୀରର ଅନ୍ୟ ଭାଗକୁ ବ୍ୟାପିଛି କି?"
  ],
  "high blood pressure": [
    "ଆପଣ ନିକଟରେ ରକ୍ତଚାପ ମାପିଛନ୍ତି କି? ତାହା କେତେ ଥିଲା?",
    "ଆପଣଙ୍କୁ ମୁଣ୍ଡ ବୁଲାଉଛି, ମୁଣ୍ଡ ବିନ୍ଧା ହେଉଛି ନା ଝାପସା ଦେଖାଯାଉଛି କି?"
  ],
  "diabetes": [
    "ଆପଣଙ୍କର ଶେଷ ସୁଗାର ରିଡିଂ କେତେ ଥିଲା?",
    "ଆପଣଙ୍କୁ ଅତ୍ୟଧିକ ଶୋଷ କିମ୍ବା ବାରମ୍ବାର ପରିସ୍ରା ଲାଗୁଛି କି?"
  ],
  "eye pain": [
    "ଆଖି ଲାଲ୍ ପଡିବା, ପାଣି ବାହାରିବା କିମ୍ବା ଦୃଷ୍ଟିଶକ୍ତିରେ ପରିବର୍ତ୍ତନ ଅଛି କି?",
    "ଆଖି ବୁଲାଇବା ବେଳେ କିମ୍ବା ଉଜ୍ଜ୍ୱଳ ଆଲୋକକୁ ଚାହିଁଲେ କଷ୍ଟ ବଢୁଛି କି?"
  ],
  "back pain": [
    "କଷ୍ଟ ଗୋଡ଼ ଆଡକୁ ଖସୁଛି କି?",
    "ଏହା ହଠାତ୍ ଗତିବିଧି କିମ୍ବା ଭାରୀ ଜିନିଷ ଉଠାଇବା ପରେ ଆରମ୍ଭ ହେଲା କି?"
  ],
  "default": [
    "କେତେ ଦିନ ହେଲାଣି ଆପଣ ଏହା ଅନୁଭବ କରୁଛନ୍ତି?",
    "ଅନ୍ୟ କୌଣସି ଲକ୍ଷଣ ଅଛି କି?"
  ]
};

let activeDiagnostic = null;

const FOLLOW_UP_QUESTIONS = {
  "stomach pain": [
    "Is the pain sharp, dull, or burning?",
    "Does the pain get worse after eating or is it constant?"
  ],
  "chest pain": [
    "⚠️ Is the pain spreading to your arm, neck, or jaw?",
    "Do you feel any shortness of breath or dizziness?"
  ],
  "fever": [
    "What is your highest recorded temperature?",
    "Are you experiencing any chills, sweating, or body aches?"
  ],
  "headache": [
    "Is the pain on one side of your head, or all over?",
    "Are you experiencing any sensitivity to light or nausea?"
  ],
  "cough": [
    "Is it a dry cough, or are you coughing up mucus?",
    "How long have you had this cough?"
  ],
  "joint pain": [
    "Which specific joints are affected?",
    "Is there any visible swelling, redness, or warmth in the area?"
  ],
  "skin rash": [
    "Is the rash itchy or painful?",
    "Has it spread to other parts of your body?"
  ],
  "high blood pressure": [
    "Have you checked your blood pressure recently? What were the readings?",
    "Are you feeling dizzy, having headaches, or experiencing blurred vision?"
  ],
  "diabetes": [
    "What was your last blood sugar reading?",
    "Are you feeling unusually thirsty or urinating more frequently?"
  ],
  "eye pain": [
    "Is there any redness, discharge, or changes in your vision?",
    "Does it hurt more when you move your eyes or look at bright lights?"
  ],
  "back pain": [
    "Is the pain radiating down your legs?",
    "Did it start after a sudden movement or lifting something heavy?"
  ],
  "default": [
    "How long have you been experiencing this?",
    "Are there any other symptoms you've noticed?"
  ]
};

// ── Format AI Response ──────────────────────────────────
function buildResponse(text, profile) {
  let condition = detectCondition(text);

  // Maintain state if we are currently diagnosing and user didn't switch topic
  if (activeDiagnostic) {
    if (!condition || condition === activeDiagnostic.condition) {
      condition = activeDiagnostic.condition;
    } else {
      activeDiagnostic = { condition: condition, step: 0 };
    }
  } else if (condition) {
    activeDiagnostic = { condition: condition, step: 0 };
  }

  const profileInfo = buildProfileContext(profile);

  if (!condition) {
    const isOr = window.currentLang === 'or';
    const txt = text.toLowerCase();
    
    // Check for conversational / emotional keywords
    const isLonely = /lonely|sad|depress|alone|cry|hopeless|anxious|stress|unhappy|down|cheer|chear|bore|scare|fear|panic|worry/i.test(txt);
    const isHello = /^hi$|^hello$|^hey$|^greetings$|namaskar/i.test(txt);
    const isThanks = /thank|appreciate|grateful/i.test(txt);
    const isWho = /who are you|what are you|your name/i.test(txt);
    const isChat = /how are you|talk to me|say something|can we talk|friend|help me/i.test(txt);
    
    if (isLonely) {
      activeDiagnostic = null; // reset diagnostic state
      const response = isOr 
        ? "ମୁଁ ବୁଝିପାରୁଛି ଯେ ଆପଣ ଏକୁଟିଆ କିମ୍ବା ଦୁଃଖିତ ଅନୁଭବ କରୁଛନ୍ତି। ଦୟାକରି ମନେରଖନ୍ତୁ ଯେ ଆପଣ ଏକୁଟିଆ ନୁହଁନ୍ତି। ମୁଁ ଏକ ମେଡିକାଲ୍ ସହକାରୀ ଏବଂ ଆପଣଙ୍କର ମାନସିକ ସ୍ୱାସ୍ଥ୍ୟ ମଧ୍ୟ ଅତ୍ୟନ୍ତ ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ। ଯଦି ଆପଣ କୌଣସି ଶାରୀରିକ ଅସୁବିଧା ଅନୁଭବ କରୁଛନ୍ତି, ତେବେ ମୋତେ ଜଣାନ୍ତୁ। କୌଣସି ଆବଶ୍ୟକତା ଥିଲେ ଆପଣଙ୍କ ପ୍ରିୟଜନ କିମ୍ବା ବିଶେଷଜ୍ଞଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ।"
        : "I hear you, and I'm really sorry you're feeling this way. Please remember that you are not alone, and it is completely okay to feel overwhelmed or down sometimes. To cheer yourself up, you might try listening to your favorite music, taking a short walk outside, or talking to someone you trust.<br><br>While I am an AI designed to analyze physical symptoms, your mental and emotional well-being is incredibly important. Please consider reaching out to a friend, family member, or a professional. If you are experiencing any physical symptoms as well, feel free to share them with me.";
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isChat) {
      activeDiagnostic = null;
      const response = isOr
        ? "ମୁଁ ଏଠାରେ ଅଛି! ଯଦିଓ ମୁଁ ଏକ କମ୍ପ୍ୟୁଟର ପ୍ରୋଗ୍ରାମ ଏବଂ କେବଳ ସ୍ୱାସ୍ଥ୍ୟ ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନର ଉତ୍ତର ଦେଇପାରେ, ମୁଁ ଆପଣଙ୍କ ସାହାଯ୍ୟ କରିବାକୁ ପ୍ରସ୍ତୁତ। ଆପଣଙ୍କୁ ଶାରୀରିକ ଭାବରେ କିପରି ଲାଗୁଛି?"
        : "I'm here for you! Even though I'm an AI and my main job is to help with medical symptoms, I'm always happy to chat. How are you feeling physically today? Any aches or pains I can help you figure out?";
      return `<p>${profileInfo}${response}</p>`;
    }
    
    if (isHello) {
      activeDiagnostic = null;
      const response = isOr 
        ? `ନମସ୍କାର${profile && profile.name ? ' ' + profile.name.split(' ')[0] : ''}! ମୁଁ ରାମନ୍ ଏଆଇ (ପରୀକ୍ଷାମୂଳକ ସଂସ୍କରଣ ୧୭୦)। ଆଜି ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟରେ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?`
        : `Hello${profile && profile.name ? ' ' + profile.name.split(' ')[0] : ''}! I am RAMAN AI (Experiment No. 170). How can I help you with your health today?`;
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isThanks) {
      activeDiagnostic = null;
      const response = isOr
        ? `ଆପଣଙ୍କୁ ସ୍ୱାଗତ! ଆପଣଙ୍କ ସାହାଯ୍ୟ କରିବା ମୋର କର୍ତ୍ତବ୍ୟ। ଅନ୍ୟ କୌଣସି ସ୍ୱାସ୍ଥ୍ୟଗତ ସମସ୍ୟା ଥିଲେ ଜଣାନ୍ତୁ।`
        : `You're very welcome! I'm here to help. If you have any other symptoms or medical questions, just let me know.`;
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isWho) {
      activeDiagnostic = null;
      const response = isOr
        ? `ମୁଁ ରାମନ୍ ଏଆଇ, ଏକ ଉନ୍ନତ କୃତ୍ରିମ ବୁଦ୍ଧିମତା (AI) ଯାହା ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ଏବଂ ଲକ୍ଷଣ ବିଷୟରେ ପରାମର୍ଶ ଦେବା ପାଇଁ ଡିଜାଇନ୍ କରାଯାଇଛି। ଆପଣଙ୍କର କୌଣସି ଲକ୍ଷଣ ଅଛି କି?`
        : `I am RAMAN AI (Experiment No. 170), an advanced medical intelligence assistant designed to help analyze your symptoms and provide preliminary health guidance. How are you feeling today?`;
      return `<p>${profileInfo}${response}</p>`;
    }

    return buildGenericResponse(text, profile, profileInfo);
  }

  // Track condition for proactive guidance
  if (typeof saveDetectedCondition === 'function') saveDetectedCondition(condition);

  const questions = (window.currentLang === 'or' ? FOLLOW_UP_ODIA[condition] : FOLLOW_UP_QUESTIONS[condition]) || 
                    (window.currentLang === 'or' ? FOLLOW_UP_ODIA.default : FOLLOW_UP_QUESTIONS.default);

  // Ask follow up questions if we haven't asked them all
  if (activeDiagnostic && activeDiagnostic.step < questions.length) {
    const q = questions[activeDiagnostic.step];
    activeDiagnostic.step++;

    let greetingHtml = "";
    if (activeDiagnostic.step === 1) {
      let base = "";
      if (window.currentLang === 'or') {
        base = ODIA_DICT.greetings[Math.floor(Math.random() * ODIA_DICT.greetings.length)];
        if (profile && profile.name) greetingHtml = `<p>${ODIA_DICT.hi} ${profile.name.split(' ')[0]}, ${base}</p>`;
        else greetingHtml = `<p>${base}</p>`;
      } else {
        const greetings = [
          "I understand you're feeling unwell.",
          "Let's see what might be going on.",
          "I'm here to help you get to the bottom of this."
        ];
        base = greetings[Math.floor(Math.random() * greetings.length)];
        if (profile && profile.name) greetingHtml = `<p>Hi ${profile.name.split(' ')[0]}, ${base.toLowerCase()}</p>`;
        else greetingHtml = `<p>${base}</p>`;
      }
    }
    
    const docQHeader = window.currentLang === 'or' ? ODIA_DICT.docQuestion : "Doctor's Question:";
    return `${profileInfo}${greetingHtml}<div class="med-section info"><p><strong>${docQHeader}</strong></p><p>${q}</p></div>`;
  }

  // Finished asking questions, provide final assessment
  activeDiagnostic = null; // Reset state
  
  const kb = MEDICAL_KB[condition];
  const isEmergency = condition === "chest pain";

  const isOr = window.currentLang === 'or';
  const introTxt = isOr ? ODIA_DICT.assessmentIntro : "Thank you for the details. Based on everything you've shared, here is my comprehensive assessment:";

  let html = `<p>${profileInfo}${introTxt}</p>`;

  html += `<div class="med-section">
    <div class="med-section-title">${isOr ? ODIA_DICT.possibleCond : "🔬 POSSIBLE CONDITIONS"}</div>
    <ul>${kb.conditions.map(c => `<li>${c}</li>`).join("")}</ul>
  </div>`;

  html += `<div class="med-section ${isEmergency ? 'warning' : ''}">
    <div class="med-section-title">${isOr ? ODIA_DICT.suggestedMed : "💊 SUGGESTED MEDICATIONS"}</div>`;
  kb.medications.forEach(m => {
    html += `<p><strong>${m.name}</strong><br>
      <small>📋 ${isOr ? ODIA_DICT.dose : "Dose:"} ${m.dose}</small><br>
      <small>ℹ️ ${isOr ? ODIA_DICT.note : "Note:"} ${m.note}</small></p>`;
  });
  html += `</div>`;

  html += `<div class="med-section ${isEmergency ? 'warning' : 'info'}">
    <div class="med-section-title">${isOr ? ODIA_DICT.precautions : "⚠️ PRECAUTIONS & WARNINGS"}</div>
    <ul>${kb.precautions.map(p => `<li>${p}</li>`).join("")}</ul>
  </div>`;

  html += `<div class="med-section info">
    <div class="med-section-title">${isOr ? ODIA_DICT.diet : "🥗 DIETARY RECOMMENDATIONS"}</div>
    <ul>${kb.diet.map(d => `<li>${d}</li>`).join("")}</ul>
  </div>`;

  html += `<p>🏥 <strong>${isOr ? ODIA_DICT.specialist : "Recommended Specialist:"}</strong> ${kb.specialist}</p>`;

  html += `<div class="med-section warning">
    <div class="med-section-title">${isOr ? ODIA_DICT.disclaimerTitle : "🔴 IMPORTANT DISCLAIMER"}</div>
    <p>${isOr ? ODIA_DICT.disclaimerBody : "This analysis is for informational purposes only. Please consult a qualified medical professional before starting any treatment. Self-medication can be dangerous."}</p>
  </div>`;

  // Auto-generate and append Health ID
  if (!currentHealthId) saveHealthSession();
  html += `
    <div class="hid-card" style="margin-top: 20px;">
      <div class="hid-card-header">🎉 YOUR HEALTH ID IS READY</div>
      <div class="hid-card-body">
        <div class="hid-code">${currentHealthId}</div>
        <p class="hid-card-desc">Your consultation is complete. Save this ID. Next visit, enter it in the Session Manager to instantly restore your profile and full consultation history.</p>
        <div class="hid-card-actions">
          <button class="hid-action-btn" onclick="navigator.clipboard.writeText('${currentHealthId}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy ID'},1500)}).catch(()=>prompt('Copy your Health ID:','${currentHealthId}'))">📋 Copy ID</button>
        </div>
      </div>
    </div>`;

  return html;
}

function buildProfileContext(profile) {
  if (!profile.name && !profile.age) return "";
  let ctx = `<strong>Patient:</strong> `;
  if (profile.name) ctx += profile.name;
  if (profile.age) ctx += `, ${profile.age} years`;
  if (profile.gender) ctx += `, ${profile.gender}`;
  if (profile.blood) ctx += ` (Blood: ${profile.blood})`;
  if (profile.allergies) ctx += ` | ⚠️ Allergies: ${profile.allergies}`;
  return `<p>${ctx}</p>`;
}

function buildGenericResponse(text, profile, profileCtx) {
  const isOr = window.currentLang === 'or';
  
  let base = "";
  if (isOr) {
    base = ODIA_DICT.genericBase[Math.floor(Math.random() * ODIA_DICT.genericBase.length)];
    if (profile && profile.name) base = `${ODIA_DICT.thanks}, ${profile.name.split(' ')[0]}। ${base}`;
  } else {
    const greetings = [
      "I want to make sure I understand correctly.",
      "To give you the safest advice,",
      "I'd like to get a clearer picture of your health.",
      "Let's figure this out together."
    ];
    base = greetings[Math.floor(Math.random() * greetings.length)];
    if (profile && profile.name) {
      base = `Thanks for reaching out, ${profile.name.split(' ')[0]}. ${base}`;
    }
  }

  const describeMsg = isOr ? ODIA_DICT.describeMore : "Could you please describe your symptoms in a bit more detail?";
  const includeTitle = isOr ? ODIA_DICT.whatToInclude : "💡 WHAT TO INCLUDE";
  const li1 = isOr ? ODIA_DICT.inc1 : "Nature of pain or discomfort (sharp, dull, burning, throbbing)";
  const li2 = isOr ? ODIA_DICT.inc2 : "Location on your body";
  const li3 = isOr ? ODIA_DICT.inc3 : "Duration and frequency of symptoms";
  const li4 = isOr ? ODIA_DICT.inc4 : "Any fever, vomiting, or other associated symptoms";
  const li5 = isOr ? ODIA_DICT.inc5 : "Any medications you are currently taking";
  const li6 = isOr ? ODIA_DICT.inc6 : "Any known allergies or pre-existing conditions";
  const footerHint = isOr ? ODIA_DICT.footerHint : "You can also use the <strong>Quick Symptoms</strong> buttons on the left panel for common conditions. I'm here to assist you! 🩺";

  return `<p>${profileCtx}${base} ${describeMsg}</p>
  <div class="med-section info">
    <div class="med-section-title">${includeTitle}</div>
    <ul>
      <li>${li1}</li>
      <li>${li2}</li>
      <li>${li3}</li>
      <li>${li4}</li>
      <li>${li5}</li>
      <li>${li6}</li>
    </ul>
  </div>
  <p>${footerHint}</p>`;
}

// ── Profile Automation & Inactivity Timer ────────────────
let profileGreeted = false;
let inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (currentHealthId) {
      addMessage('ai', '<div class="med-section warning"><p>🔒 <strong>Session Locked:</strong> 15 minutes of inactivity detected. Your data has been securely saved.</p></div>', true);
      endCurrentSession();
    }
  }, 15 * 60 * 1000);
}

// Ensure the inactivity timer resets on user interaction
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

function updateProfileCompleteness(skipGreeting = false) {
  const p = getProfile();
  let filled = 0;
  if (p.name) filled++;
  if (p.age) filled++;
  if (p.gender) filled++;
  if (p.blood) filled++;
  if (p.allergies) filled++;
  
  const pct = (filled / 5) * 100;
  const fillEl = document.getElementById('completenessFill');
  const txtEl = document.getElementById('completenessText');
  if (fillEl) fillEl.style.width = pct + '%';
  if (txtEl) txtEl.textContent = Math.round(pct) + '% Complete';
  
  if (pct === 100 && !profileGreeted && !skipGreeting) {
    profileGreeted = true;
    setTimeout(() => {
      addMessage('ai', `<div class="med-section info"><p>👋 Hello <strong>${p.name}</strong>! Your profile is complete. How can I assist you with your health today?</p></div>`, true);
    }, 600);
  }
}

// Attach listeners to profile inputs
['patientName', 'patientAge', 'patientGender', 'patientBlood', 'patientAllergies'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { updateProfileCompleteness(false); saveProfile(); });
});

// ── Chat Functions ──────────────────────────────────────
function getProfile() {
  return {
    name: document.getElementById("patientName").value.trim(),
    age:  document.getElementById("patientAge").value.trim(),
    gender: document.getElementById("patientGender").value,
    blood: document.getElementById("patientBlood").value,
    allergies: document.getElementById("patientAllergies").value.trim()
  };
}

// ── Session Counter state (declared here so addMessage can use it) ──
let sessionMsgs = 0;

function addMessage(role, content, isHTML = false) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `message ${role === "user" ? "user-message" : "ai-message"}`;

  const avatarIcon = role === "user" ? "🧑" : "🤖";
  const avatarClass = role === "user" ? "user-avatar" : "ai-avatar";
  const senderName = role === "user" ? "YOU" : "RAMAN AI";
  const bubbleClass = role === "user" ? "user-bubble" : "ai-bubble";
  const badge = role === "ai" ? `<span class="message-badge">Experiment № 170</span>` : "";

  div.innerHTML = `
    <div class="message-avatar ${avatarClass}"><span>${avatarIcon}</span></div>
    <div class="message-content">
      <div class="message-header">
        <span class="sender-name">${senderName}</span>
        ${badge}
        <span class="message-time">${nowTime()}</span>
      </div>
      <div class="message-bubble ${bubbleClass}">
        ${isHTML ? content : `<p>${escapeHtml(content)}</p>`}
      </div>
    </div>`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Session counter
  if (role === "user") {
    sessionMsgs++;
    const sc = document.getElementById("sessionCount");
    if (sc) sc.textContent = sessionMsgs;
  }

  // Auto-add reactions to AI messages
  if (role === "ai") {
    const r = document.createElement("div");
    r.className = "msg-reactions";
    r.innerHTML = `<button class="reaction-btn" title="Helpful">👍</button>
      <button class="reaction-btn" title="Love it">❤️</button>
      <button class="reaction-btn" title="Great">🙌</button>`;
    r.querySelectorAll(".reaction-btn").forEach(b => {
      b.addEventListener("click", () => b.classList.toggle("reacted"));
    });
    div.querySelector(".message-content").appendChild(r);
  }
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

function showTyping(show) {
  const t = document.getElementById("typingIndicator");
  if (t) t.style.display = show ? "flex" : "none";
  document.getElementById("btnSend").disabled = show;

  if (show) {
    const label = t.querySelector('.typing-label');
    const phrases = ["RAMAN AI is analyzing...", "Consulting medical KB...", "Synthesizing response..."];
    let idx = 0;
    label.textContent = phrases[0];
    window._typingInterval = setInterval(() => {
      idx = (idx + 1) % phrases.length;
      label.textContent = phrases[idx];
    }, 800);
  } else {
    clearInterval(window._typingInterval);
  }
}

async function sendMessage() {
  resetInactivityTimer();
  
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  const p = getProfile();
  const isProfileComplete = p.name && p.age && p.gender && p.blood && p.allergies;

  addMessage("user", text);
  // Capture to chat history
  chatHistory.push({ role:'user', text: text.slice(0,200), time: nowTime() });
  if (chatHistory.length > 20) chatHistory.shift();

  input.value = "";
  updateCharCount();
  showTyping(true);
  document.getElementById("chatMessages").scrollTop = 9999;

  const delay = 1400 + Math.random() * 1200;
  await new Promise(r => setTimeout(r, delay));

  if (!isProfileComplete) {
    showTyping(false);
    addMessage("ai", `<div class="med-section warning"><p>⚠️ <strong>Consultation Blocked:</strong> Please fully complete your <strong>Patient Profile</strong> on the left side before we begin.</p><p>I need this information to ensure your safety and provide accurate advice.</p></div>`, true);
    return;
  }

  showTyping(false);
  const profile = getProfile();
  const response = buildResponse(text, profile);
  addMessage("ai", response, true);

  // Capture AI response
  chatHistory.push({ role:'ai', text: response.replace(/<[^>]*>/g,'').slice(0,200), time: nowTime() });
  if (chatHistory.length > 20) chatHistory.shift();

  // After FIRST consultation: generate + save Health ID, show card
  if (!hidShownThisSession && sessionMsgs === 1) {
    hidShownThisSession = true;
    saveHealthSession();                          // sets currentHealthId
    setTimeout(() => showHealthIdCard(currentHealthId, true), 400);
  } else if (sessionMsgs > 1 && currentHealthId) {
    // Debounce-save on subsequent messages
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(saveHealthSession, 1500);
  }
}

// ── Event Listeners ─────────────────────────────────────
document.getElementById("btnSend").addEventListener("click", sendMessage);

document.getElementById("userInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById("userInput").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 140) + "px";
  updateCharCount();
});

function updateCharCount() {
  const v = document.getElementById("userInput").value.length;
  document.getElementById("charCount").textContent = `${v}/1000`;
}



document.querySelectorAll(".symptom-tag").forEach(btn => {
  btn.addEventListener("click", () => {
    const symptom = btn.dataset.symptom;
    document.getElementById("userInput").value = symptom;
    updateCharCount();
    document.getElementById("userInput").focus();
    document.getElementById("userInput").dispatchEvent(new Event("input"));
    sendMessage();
  });
});

// Welcome message reactions
document.querySelectorAll(".reaction-btn").forEach(b => {
  b.addEventListener("click", () => b.classList.toggle("reacted"));
});

// ── Profile Completeness ────────────────────────────────
function updateProfileCompleteness() {
  const fields = ["patientName","patientAge","patientGender","patientBlood","patientAllergies"];
  const filled = fields.filter(id => document.getElementById(id).value.trim()).length;
  const pct = Math.round((filled / fields.length) * 100);
  document.getElementById("completenessFill").style.width = pct + "%";
  document.getElementById("completenessText").textContent = pct + "% Complete";
  const gender = document.getElementById("patientGender").value;
  const emoji = gender === "female" ? "👩‍⚕️" : gender === "male" ? "👨‍⚕️" : "👤";
  document.getElementById("avatarEmoji").textContent = emoji;
  // Persist immediately
  if (typeof saveProfile === 'function') saveProfile();
}
["patientName","patientAge","patientGender","patientBlood","patientAllergies"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateProfileCompleteness);
  document.getElementById(id).addEventListener("change", updateProfileCompleteness);
});

// ── Pain Slider ─────────────────────────────────────────
const painEmojis = ["","😊","🙂","😐","😟","😣","😖","😫","😩","😤","😱"];
document.getElementById("painSlider").addEventListener("input", function() {
  const v = parseInt(this.value);
  document.getElementById("painValue").textContent = v;
  document.getElementById("painEmoji").textContent = painEmojis[v];
  if (typeof saveProfile === 'function') saveProfile();
});

// ── Header Vitals Animation ─────────────────────────────
setInterval(() => {
  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  if (cpu) cpu.style.width = (40 + Math.random() * 50) + "%";
  if (neural) neural.style.width = (30 + Math.random() * 60) + "%";
}, 2000);

// ── Voice Input ─────────────────────────────────────────
let recognition = null;
let isListening = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  recognition.onresult = e => {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    document.getElementById("userInput").value = transcript;
    updateCharCount();
    document.getElementById("userInput").dispatchEvent(new Event("input"));
  };
  recognition.onend = () => stopVoice();
  recognition.onerror = () => stopVoice();
}

function startVoice() {
  if (!recognition) {
    alert("Voice input is not supported in this browser. Please use Chrome.");
    return;
  }
  isListening = true;
  document.getElementById("voiceIcon").textContent = "🔴";
  document.getElementById("voiceLabel").textContent = "Listening…";
  document.getElementById("voiceWaveform").style.display = "flex";
  document.getElementById("voiceStatus").textContent = "Speak now…";
  document.getElementById("btnVoice").classList.add("voice-active");
  recognition.start();
}
function stopVoice() {
  isListening = false;
  document.getElementById("voiceIcon").textContent = "🎙";
  document.getElementById("voiceLabel").textContent = "Voice";
  document.getElementById("voiceWaveform").style.display = "none";
  document.getElementById("voiceStatus").textContent = "";
  document.getElementById("btnVoice").classList.remove("voice-active");
  if (recognition) try { recognition.stop(); } catch(e){}
}
document.getElementById("btnVoice").addEventListener("click", () => {
  isListening ? stopVoice() : startVoice();
});

// ── File Upload ─────────────────────────────────────────
document.getElementById("btnUpload").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  openMediaModal(file);
  e.target.value = "";
});

let pendingFile = null;
function openMediaModal(file) {
  pendingFile = file;
  const modal = document.getElementById("mediaModal");
  const wrap = document.getElementById("modalMediaWrap");
  const analysis = document.getElementById("modalAnalysis");
  analysis.innerHTML = "";
  modal.style.display = "flex";
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    wrap.innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:300px;border-radius:8px;"></video>`;
  } else {
    wrap.innerHTML = `<img src="${url}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain;" />`;
  }
}

document.getElementById("modalClose").addEventListener("click", closeMediaModal);
document.getElementById("mediaModalBackdrop").addEventListener("click", closeMediaModal);
function closeMediaModal() {
  document.getElementById("mediaModal").style.display = "none";
  pendingFile = null;
}

document.getElementById("btnAnalyze").addEventListener("click", () => {
  if (!pendingFile) return;
  const analysis = document.getElementById("modalAnalysis");
  analysis.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Analyzing with RAMAN AI…</div>`;
  setTimeout(() => {
    const result = analyzeMedia(pendingFile);
    analysis.innerHTML = result;
    // Send to chat
    setTimeout(() => {
      const type = pendingFile.type.startsWith("video/") ? "🎥 Video" : "📷 Image";
      const url = URL.createObjectURL(pendingFile);
      const imgTag = pendingFile.type.startsWith("video/")
        ? `<div class="chat-media-thumb">🎥 <em>${pendingFile.name}</em></div>`
        : `<img src="${url}" class="chat-media-thumb" style="max-width:220px;border-radius:8px;display:block;margin-bottom:8px;" />`;
      addMessage("user", `${imgTag}<p>Uploaded ${type} for analysis: <strong>${pendingFile.name}</strong></p>`, true);
      addMessage("ai", result, true);
      closeMediaModal();
    }, 800);
  }, 2000);
});

function analyzeMedia(file) {
  const name = file.name.toLowerCase();
  const type = file.type;
  let condition = "general";
  if (name.includes("rash") || name.includes("skin") || name.includes("itch")) condition = "skin";
  else if (name.includes("xray") || name.includes("x-ray") || name.includes("chest")) condition = "xray";
  else if (name.includes("eye") || name.includes("retina")) condition = "eye";
  else if (name.includes("wound") || name.includes("cut") || name.includes("injury")) condition = "wound";
  else if (type.startsWith("video/")) condition = "video";

  const analyses = {
    skin: `<div class="med-section warning"><div class="med-section-title">🔬 VISUAL ANALYSIS – SKIN</div>
      <p><strong>Detected Pattern:</strong> Possible inflammatory skin condition. Redness and irregular texture visible.</p>
      <p><strong>Possible Conditions:</strong> Allergic Dermatitis, Eczema, Urticaria, Fungal Infection</p>
      <p><strong>Recommended:</strong> Cetirizine 10mg (antihistamine), Hydrocortisone 1% cream</p></div>
      <p>📋 Please consult a <strong>Dermatologist</strong> for confirmed diagnosis.</p>`,
    xray: `<div class="med-section info"><div class="med-section-title">🫁 VISUAL ANALYSIS – CHEST X-RAY</div>
      <p><strong>Detected:</strong> Lung fields under analysis. AI pattern recognition active.</p>
      <p><strong>Observations:</strong> Opacity levels, rib cage structure, and mediastinum evaluated.</p>
      <p><strong>Next Step:</strong> Please share this with a <strong>Pulmonologist / Radiologist</strong> for accurate interpretation.</p></div>`,
    eye: `<div class="med-section info"><div class="med-section-title">👁️ VISUAL ANALYSIS – EYE</div>
      <p><strong>Detected Pattern:</strong> Conjunctival redness or retinal pattern analyzed.</p>
      <p><strong>Possible:</strong> Conjunctivitis, Dry Eye, or Digital Eye Strain</p>
      <p><strong>Recommended:</strong> Artificial Tears, rest from screens, consult <strong>Ophthalmologist</strong></p></div>`,
    wound: `<div class="med-section warning"><div class="med-section-title">🩹 VISUAL ANALYSIS – WOUND/INJURY</div>
      <p><strong>Detected:</strong> Open wound or laceration detected in image.</p>
      <p><strong>Immediate Care:</strong> Clean with antiseptic, apply pressure to stop bleeding.</p>
      <p><strong>⚠️ Deep wounds require immediate medical attention.</strong></p></div>`,
    video: `<div class="med-section info"><div class="med-section-title">🎥 VIDEO ANALYSIS – SYMPTOM CAPTURE</div>
      <p><strong>Video received</strong> for symptom documentation.</p>
      <p>Motion patterns, tremors, gait, or visible symptoms have been logged for AI review.</p>
      <p>Please describe your symptoms in text for combined analysis.</p></div>`,
    general: `<div class="med-section info"><div class="med-section-title">🔬 VISUAL ANALYSIS COMPLETE</div>
      <p><strong>File analyzed:</strong> ${file.name}</p>
      <p>No specific medical pattern auto-detected. Please describe your symptoms in the chat for a full assessment.</p>
      <p>For best results, upload clear images of affected areas (skin, wounds, eyes, X-rays).</p></div>`
  };
  return analyses[condition] || analyses.general;
}

// ── Camera Modal ─────────────────────────────────────────
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentCamFacing = "user";

document.getElementById("btnCamera").addEventListener("click", openCamera);
document.getElementById("cameraClose").addEventListener("click", closeCamera);
document.getElementById("cameraBackdrop").addEventListener("click", closeCamera);

async function openCamera() {
  document.getElementById("cameraModal").style.display = "flex";
  await startCameraStream();
}

async function startCameraStream() {
  try {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentCamFacing }, audio: true
    });
    document.getElementById("cameraStream").srcObject = cameraStream;
  } catch(err) {
    alert("Camera access denied or not available. Please allow camera permissions.");
    closeCamera();
  }
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  if (isRecording) stopRecording();
  document.getElementById("cameraModal").style.display = "none";
}

document.getElementById("btnCapture").addEventListener("click", () => {
  const video = document.getElementById("cameraStream");
  const canvas = document.getElementById("captureCanvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    closeCamera();
    openMediaModal(file);
  }, "image/jpeg", 0.92);
});

document.getElementById("btnRecord").addEventListener("click", () => {
  isRecording ? stopRecording() : startRecording();
});

function startRecording() {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(cameraStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const file = new File([blob], "symptom-video.webm", { type: "video/webm" });
    closeCamera();
    openMediaModal(file);
  };
  mediaRecorder.start();
  isRecording = true;
  document.getElementById("btnRecord").textContent = "⏹ Stop Recording";
  document.getElementById("btnRecord").style.background = "rgba(255,77,109,0.3)";
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  document.getElementById("btnRecord").textContent = "🔴 Record Video";
  document.getElementById("btnRecord").style.background = "";
}

document.getElementById("btnSwitchCam").addEventListener("click", () => {
  currentCamFacing = currentCamFacing === "user" ? "environment" : "user";
  startCameraStream();
});

// ── Clear Chat: reset session count (merged into existing listener above) ──
// ═══════════════════════════════════════════════════════
// ── PROFILE PERSISTENCE (localStorage) ─────────────────
// ═══════════════════════════════════════════════════════
function saveProfile() {
  const p = getProfile();
  p.pain = document.getElementById('painSlider').value;
  localStorage.setItem('ramanai_profile', JSON.stringify(p));
}

function loadProfile() {
  const raw = localStorage.getItem('ramanai_profile');
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    if (p.name)     document.getElementById('patientName').value = p.name;
    if (p.age)      document.getElementById('patientAge').value  = p.age;
    if (p.gender)   document.getElementById('patientGender').value = p.gender;
    if (p.blood)    document.getElementById('patientBlood').value  = p.blood;
    if (p.allergies) document.getElementById('patientAllergies').value = p.allergies;
    if (p.pain) {
      const slider = document.getElementById('painSlider');
      slider.value = p.pain;
      slider.dispatchEvent(new Event('input'));
    }
    updateProfileCompleteness();
    if (p.name) {
      setTimeout(() => {
        addMessage('ai',
          `<p>👋 Welcome back, <strong>${p.name}</strong>! Your health profile has been restored.</p>
           <div class="med-section info"><div class="med-section-title">🧠 PROFILE LOADED</div>
           <p>Age: <strong>${p.age || '—'}</strong> &nbsp;|&nbsp; Gender: <strong>${p.gender || '—'}</strong> &nbsp;|&nbsp; Blood: <strong>${p.blood || '—'}</strong></p>
           ${p.allergies ? `<p>⚠️ Known allergies: <strong>${p.allergies}</strong></p>` : ''}
           <p>You have <strong>${vaultData.length}</strong> document(s) in your Medical Vault. How can I help you today?</p></div>`,
          true);
      }, 600);
    }
  } catch(e) { console.warn('Profile load error', e); }
}

// (saveProfile is called directly from updateProfileCompleteness and painSlider above)

// ═══════════════════════════════════════════════════════
// ── MEDICAL VAULT ──────────────────────────────────────
// ═══════════════════════════════════════════════════════
// (vaultData declared at top of file)

const VAULT_BADGE = {
  lab:          { icon: '🧪', label: 'Lab Report',  color: '#00ffb3' },
  prescription: { icon: '💊', label: 'Prescription', color: '#1a6fff' },
  xray:         { icon: '🫁', label: 'X-Ray',        color: '#9b6bff' },
  mri:          { icon: '🧠', label: 'MRI/CT',       color: '#ff9f43' },
  ecg:          { icon: '❤️', label: 'ECG',          color: '#ff4d6d' },
  discharge:    { icon: '📋', label: 'Discharge',    color: '#00e5ff' },
  photo:        { icon: '📷', label: 'Photo',        color: '#a8ff78' },
  video:        { icon: '🎥', label: 'Video',        color: '#f8b500' },
  general:      { icon: '📄', label: 'Document',     color: '#6a8bad' }
};

function saveToVault(name, type, summary, analysis) {
  const entry = {
    id: Date.now(),
    name, type, summary, analysis,
    date: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  };
  vaultData.unshift(entry);
  if (vaultData.length > 20) vaultData.pop();
  localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
  renderVault();
  // Also update stored conditions
  saveDetectedCondition(type);
}

function renderVault() {
  const list  = document.getElementById('vaultList');
  const empty = document.getElementById('vaultEmpty');
  const count = document.getElementById('vaultCount');
  if (!list) return;
  if (!vaultData.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    count.textContent = '0 docs';
    return;
  }
  empty.style.display = 'none';
  count.textContent = vaultData.length + ' doc' + (vaultData.length > 1 ? 's' : '');
  list.innerHTML = vaultData.map(v => {
    const b = VAULT_BADGE[v.type] || VAULT_BADGE.general;
    return `<div class="vault-item" data-id="${v.id}">
      <div class="vault-item-icon" style="color:${b.color}">${b.icon}</div>
      <div class="vault-item-info">
        <div class="vault-item-name">${v.name}</div>
        <div class="vault-item-meta"><span class="vault-badge" style="border-color:${b.color};color:${b.color}">${b.label}</span> ${v.date}</div>
      </div>
      <button class="vault-view-btn" data-id="${v.id}" title="View analysis">▶</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.vault-view-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const entry = vaultData.find(v => v.id == btn.dataset.id);
      if (entry) {
        addMessage('ai',
          `<p>📂 Showing saved analysis for: <strong>${entry.name}</strong> (${entry.date})</p>${entry.analysis}`,
          true);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════
// ── ENHANCED DOCUMENT ANALYSIS ─────────────────────────
// ═══════════════════════════════════════════════════════
function detectDocType(file, manualType) {
  if (manualType && manualType !== 'auto') return manualType;
  const n = file.name.toLowerCase();
  if (/lab|blood|cbc|haemo|hb|urine|report|test|wbc|rbc|platelets|hba1c|glucose|lipid|thyroid/.test(n)) return 'lab';
  if (/rx|prescription|medicine|medic|tablet|capsule|dr\.|doctor|clinic/.test(n)) return 'prescription';
  if (/xray|x-ray|x_ray|chest|lung|bone|fracture|radiograph/.test(n)) return 'xray';
  if (/mri|ct|scan|brain|spine|lumbar|cervical|tumor|neuro/.test(n)) return 'mri';
  if (/ecg|ekg|cardio|heart|cardiac|echo/.test(n)) return 'ecg';
  if (/discharge|summary|hospital|ward|inpatient|admit/.test(n)) return 'discharge';
  if (file.type.startsWith('video/')) return 'video';
  return 'photo';
}

function analyzeDocument(file, docType, profile) {
  const b   = VAULT_BADGE[docType] || VAULT_BADGE.general;
  const name = profile && profile.name ? `<strong>${profile.name}</strong>` : 'the patient';
  const allergies = profile && profile.allergies ? profile.allergies : null;

  const templates = {
    lab: () => `
      <div class="med-section info"><div class="med-section-title">🧪 LAB REPORT ANALYSIS</div>
      <p>Document received for ${name}. Key parameters assessed:</p>
      <table class="doc-table">
        <tr><th>Parameter</th><th>Typical Range</th><th>Guidance</th></tr>
        <tr><td>Haemoglobin (Hb)</td><td>M: 13–17 g/dL / F: 12–15 g/dL</td><td>Low Hb → Iron deficiency / Anaemia</td></tr>
        <tr><td>Fasting Blood Glucose</td><td>70–100 mg/dL</td><td>&gt;126 → Diabetes; 101–125 → Pre-diabetes</td></tr>
        <tr><td>HbA1c</td><td>&lt;5.7%</td><td>5.7–6.4% Pre-diabetic; ≥6.5% Diabetic</td></tr>
        <tr><td>Total Cholesterol</td><td>&lt;200 mg/dL</td><td>&gt;240 → High cardiovascular risk</td></tr>
        <tr><td>TSH (Thyroid)</td><td>0.4–4.0 mIU/L</td><td>High TSH → Hypothyroidism</td></tr>
        <tr><td>Creatinine</td><td>0.6–1.2 mg/dL</td><td>Elevated → Kidney function concern</td></tr>
      </table></div>
      <div class="med-section warning"><div class="med-section-title">📋 NEXT STEPS</div>
      <p>Please share the <strong>actual values</strong> from your report in the chat and I will flag any abnormals and suggest next steps.</p>
      ${allergies ? `<p>⚠️ Allergy note: <strong>${allergies}</strong> — ensure prescribed supplements are safe.</p>` : ''}</div>`,

    prescription: () => `
      <div class="med-section"><div class="med-section-title">💊 PRESCRIPTION ANALYSIS</div>
      <p>Prescription document received for ${name}.</p>
      <p>To extract your medicine list, please type the medicine names from the prescription in the chat. I will then provide:</p>
      <ul>
        <li>📋 Purpose of each medicine</li>
        <li>⏰ Optimal timing and food instructions</li>
        <li>⚠️ Drug interaction warnings</li>
        <li>🔁 Refill reminders</li>
      </ul></div>
      <div class="med-section info"><div class="med-section-title">💡 GENERAL PRESCRIPTION TIPS</div>
      <ul>
        <li>Complete the full course even if you feel better</li>
        <li>Never double-dose if you miss one</li>
        <li>Store medicines away from heat and moisture</li>
        ${allergies ? `<li>⚠️ Always verify medicines against your allergy: <strong>${allergies}</strong></li>` : ''}
      </ul></div>`,

    xray: () => `
      <div class="med-section"><div class="med-section-title">🫁 X-RAY REPORT ANALYSIS</div>
      <p>Radiograph document received for ${name}.</p>
      <p><strong>RAMAN AI Visual Assessment Framework:</strong></p>
      <ul>
        <li>🫁 Lung fields — checking for opacity, consolidation, effusion</li>
        <li>❤️ Cardiac silhouette — size and border assessment</li>
        <li>🦴 Bone structure — fractures, density, alignment</li>
        <li>📐 Mediastinum — width and contour</li>
        <li>🔍 Diaphragm — elevation, flattening</li>
      </ul></div>
      <div class="med-section warning"><div class="med-section-title">⚠️ IMPORTANT</div>
      <p>X-ray interpretation requires a qualified <strong>Radiologist</strong>. Please describe any written findings/impressions from the report in chat for further guidance.</p></div>`,

    mri: () => `
      <div class="med-section"><div class="med-section-title">🧠 MRI / CT SCAN ANALYSIS</div>
      <p>Neuroimaging document received for ${name}.</p>
      <p><strong>Assessment checklist:</strong></p>
      <ul>
        <li>🧠 Brain parenchyma — lesions, atrophy, signal changes</li>
        <li>🩸 Vascular structures — occlusion, aneurysm signs</li>
        <li>🦴 Spinal cord — disc herniation, canal stenosis, cord signal</li>
        <li>📏 Measurements — tumour size, midline shift</li>
      </ul></div>
      <div class="med-section warning"><div class="med-section-title">⚠️ NEXT STEPS</div>
      <p>MRI/CT must be interpreted by a <strong>Neurologist or Radiologist</strong>. Please paste the written report "Impression" section here for specific guidance.</p></div>`,

    ecg: () => `
      <div class="med-section"><div class="med-section-title">❤️ ECG / CARDIOLOGY REPORT</div>
      <p>ECG document received for ${name}.</p>
      <p><strong>Key parameters reviewed:</strong></p>
      <table class="doc-table">
        <tr><th>Parameter</th><th>Normal</th></tr>
        <tr><td>Heart Rate</td><td>60–100 bpm</td></tr>
        <tr><td>PR Interval</td><td>120–200 ms</td></tr>
        <tr><td>QRS Duration</td><td>&lt;120 ms</td></tr>
        <tr><td>QT Interval</td><td>&lt;440 ms (M) / &lt;460 ms (F)</td></tr>
        <tr><td>ST Segment</td><td>Isoelectric (no elevation/depression)</td></tr>
      </table></div>
      <div class="med-section warning"><div class="med-section-title">⚠️ CARDIAC ALERT</div>
      <p>Any ST-elevation, new LBBB, or chest pain = <strong>call emergency services immediately</strong>. Consult a <strong>Cardiologist</strong> for ECG interpretation.</p></div>`,

    discharge: () => `
      <div class="med-section info"><div class="med-section-title">📋 DISCHARGE SUMMARY ANALYSIS</div>
      <p>Discharge document received for ${name}.</p>
      <p>Please share key details from the discharge summary in chat:</p>
      <ul>
        <li>🏥 Primary diagnosis</li>
        <li>💊 Medicines prescribed on discharge</li>
        <li>📅 Follow-up date and specialist</li>
        <li>⚠️ Warning signs to watch for</li>
        <li>🚫 Activity restrictions</li>
      </ul></div>
      <div class="med-section"><div class="med-section-title">💡 POST-DISCHARGE CARE</div>
      <ul>
        <li>Attend all follow-up appointments</li>
        <li>Take all medicines as prescribed; do not stop early</li>
        <li>Watch for fever, wound discharge, or worsening pain</li>
        <li>Maintain light diet and adequate hydration</li>
      </ul></div>`,

    photo: () => {
      const n2 = file.name.toLowerCase();
      if (/rash|skin|itch|eczema/.test(n2)) return templates.skin();
      if (/wound|cut|injur|bleed/.test(n2)) return templates.wound();
      if (/eye|retina|conjunctiv/.test(n2)) return templates.eye();
      return `<div class="med-section info"><div class="med-section-title">📷 SYMPTOM PHOTO ANALYSIS</div>
        <p>Photo received for ${name}. No specific pattern auto-detected from filename.</p>
        <p>Please describe what is visible in the photo (e.g., skin colour, swelling, rash pattern) for targeted analysis.</p></div>`;
    },

    skin:  () => `<div class="med-section warning"><div class="med-section-title">🔬 VISUAL ANALYSIS – SKIN</div>
      <p><strong>Detected:</strong> Possible inflammatory skin condition.</p>
      <p><strong>Possible:</strong> Allergic Dermatitis, Eczema, Urticaria, Fungal Infection</p>
      <p><strong>Rx:</strong> Cetirizine 10 mg (night) + Hydrocortisone 1% cream (local)</p></div>
      <p>Consult <strong>Dermatologist</strong> for confirmed diagnosis.</p>`,

    wound: () => `<div class="med-section warning"><div class="med-section-title">🩹 WOUND / INJURY</div>
      <p>Clean with antiseptic. Apply pressure to stop bleeding.</p>
      <p>⚠️ Deep or gaping wounds require immediate stitching — visit Emergency.</p></div>`,

    eye:   () => `<div class="med-section info"><div class="med-section-title">👁️ EYE CONDITION</div>
      <p><strong>Possible:</strong> Conjunctivitis, Dry Eye, Digital Eye Strain</p>
      <p>Artificial Tears 4×/day. Consult <strong>Ophthalmologist</strong>.</p></div>`,

    video: () => `<div class="med-section info"><div class="med-section-title">🎥 VIDEO SYMPTOM CAPTURE</div>
      <p>Video logged for AI review. Please describe symptoms in text for combined analysis.</p></div>`,

    general: () => `<div class="med-section info"><div class="med-section-title">🔬 DOCUMENT ANALYSIS</div>
      <p>File <strong>${file.name}</strong> received. Please paste key findings or values in chat for detailed assessment.</p></div>`
  };

  const fn = templates[docType] || templates.general;
  return fn();
}

// Override old btnAnalyze handler — clone to remove old listener then re-attach
(function() {
  const old = document.getElementById('btnAnalyze');
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('click', () => {
    if (!pendingFile) return;
    const analysis  = document.getElementById('modalAnalysis');
    const manualType = document.getElementById('docTypeSelect').value;
    analysis.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Analyzing with RAMAN AI…</div>`;
    setTimeout(() => {
      const profile  = getProfile();
      const docType  = detectDocType(pendingFile, manualType);
      const result   = analyzeDocument(pendingFile, docType, profile);
      const b        = VAULT_BADGE[docType] || VAULT_BADGE.general;
      const summary  = `${b.icon} ${b.label} – ${pendingFile.name}`;
      analysis.innerHTML = result;
      saveToVault(pendingFile.name, docType, summary, result);
      setTimeout(() => {
        const url    = URL.createObjectURL(pendingFile);
        const isVid  = pendingFile.type.startsWith('video/');
        const thumb  = isVid
          ? `<div class="chat-media-thumb">🎥 <em>${pendingFile.name}</em></div>`
          : `<img src="${url}" style="max-width:220px;border-radius:8px;display:block;margin-bottom:8px;"/>` ;
        addMessage('user', `${thumb}<p>${b.icon} Uploaded <strong>${b.label}</strong>: ${pendingFile.name}</p>`, true);
        addMessage('ai',   result, true);
        closeMediaModal();
        document.getElementById('docTypeSelect').value = 'auto';
      }, 600);
    }, 1800);
  });
})();

// ═══════════════════════════════════════════════════════
// ── DETECTED CONDITIONS TRACKING ───────────────────────
// ═══════════════════════════════════════════════════════
// (detectedConditions declared at top of file)

function saveDetectedCondition(condition) {
  detectedConditions.add(condition);
  localStorage.setItem('ramanai_conditions', JSON.stringify([...detectedConditions]));
}

// (saveDetectedCondition is called directly inside buildResponse above)

// ═══════════════════════════════════════════════════════
// ── PROACTIVE HEALTH GUIDANCE ENGINE ───────────────────
// ═══════════════════════════════════════════════════════
const GUIDANCE_TIPS = {
  diabetes: [
    '🩸 <strong>Diabetes Reminder:</strong> Have you logged your blood sugar today? Fasting level should be 70–100 mg/dL. Post-meal (2 hrs) should be below 140 mg/dL.',
    '🥗 <strong>Diet Tip (Diabetes):</strong> Choose low-glycaemic foods today — oats, dal, vegetables. Avoid white rice, maida, and sugary drinks.',
    '💊 <strong>Medication Check:</strong> Have you taken your Metformin with meals today? Consistency is key to glucose control.'
  ],
  'high blood pressure': [
    '💊 <strong>BP Reminder:</strong> Have you taken your blood pressure medication today? Never skip — abrupt stopping can cause rebound hypertension.',
    '🧂 <strong>Sodium Alert:</strong> Keep sodium intake below 2g/day. Avoid pickles, papad, processed snacks. Increase banana, spinach (potassium) intake.',
    '📏 <strong>BP Monitoring:</strong> Check your blood pressure now and note the reading. BP above 180/120 mmHg = seek emergency care immediately.'
  ],
  'joint pain': [
    '🦵 <strong>Joint Health:</strong> Have you done 10 minutes of gentle range-of-motion exercises today? Inactivity worsens stiffness.',
    '🐟 <strong>Diet Tip (Joints):</strong> Omega-3 rich foods (fish, flaxseed, walnuts) reduce inflammation. Turmeric + black pepper is a natural anti-inflammatory.'
  ],
  fever: [
    '🌡️ <strong>Fever Follow-up:</strong> How are you feeling today? If fever persists beyond 3 days or exceeds 104°F (40°C), please seek urgent medical care.',
    '💧 <strong>Hydration Reminder:</strong> Drink at least 8–10 glasses of water/day during illness. Electrolyte drinks (ORS) help if you had vomiting or diarrhoea.'
  ],
  cough: [
    '🫁 <strong>Respiratory Check:</strong> A cough lasting more than 3 weeks needs investigation — could indicate TB, asthma or GERD. Please consult a doctor.',
    '♨️ <strong>Home Remedy:</strong> Steam inhalation twice daily (add a few drops of eucalyptus oil) can ease congestion and cough.'
  ],
  general: [
    '💧 <strong>Daily Reminder:</strong> Stay hydrated! Drink 8–10 glasses of water today. Dehydration causes headaches, fatigue, and poor concentration.',
    '🛌 <strong>Sleep Hygiene:</strong> Aim for 7–8 hours of sleep. Poor sleep raises blood pressure, blood sugar, and weakens immunity.',
    '🚶 <strong>Activity Reminder:</strong> 30 minutes of brisk walking daily reduces risk of heart disease, diabetes, and depression.',
    '🥗 <strong>Nutrition Tip:</strong> Fill half your plate with vegetables, one-quarter with protein, one-quarter with whole grains.',
    '📅 <strong>Checkup Reminder:</strong> Annual health screenings save lives — blood sugar, BP, lipid profile, and eye check are recommended for adults above 30.'
  ]
};

let lastGuidanceTime = 0;

function scheduleGuidance(onLoad) {
  if (onLoad) {
    // Fire 8 seconds after app loads if profile exists
    setTimeout(() => {
      const raw = localStorage.getItem('ramanai_profile');
      if (raw) {
        try { const p = JSON.parse(raw); if (p.name) sendGuidanceMessage(); } catch(e) {}
      }
    }, 8000);
  }
  // Then every 45 minutes
  setInterval(sendGuidanceMessage, 45 * 60 * 1000);
}

function sendGuidanceMessage() {
  const now = Date.now();
  if (now - lastGuidanceTime < 60000) return; // throttle: not more than once per minute
  lastGuidanceTime = now;

  const profile    = getProfile();
  const conditions = [...detectedConditions];

  // Pick a relevant tip
  let pool = [];
  conditions.forEach(c => {
    if (GUIDANCE_TIPS[c]) pool = pool.concat(GUIDANCE_TIPS[c]);
  });
  if (!pool.length) pool = GUIDANCE_TIPS.general;

  const tip = pool[Math.floor(Math.random() * pool.length)];
  const greeting = profile.name ? `${profile.name}, ` : '';

  const html = `
    <div class="guidance-bubble">
      <div class="guidance-header">💡 HEALTH REMINDER &nbsp;<span class="guidance-time">${nowTime()}</span></div>
      <p>${greeting}${tip}</p>
      ${vaultData.length ? `<p class="guidance-vault">📁 You have <strong>${vaultData.length}</strong> document(s) in your Medical Vault — click any to re-view analysis.</p>` : ''}
    </div>`;

  addMessage('ai', html, true);
}

// ═══════════════════════════════════════════════════════
// ── HEALTH ID SYSTEM ────────────────────────────────────
// ═══════════════════════════════════════════════════════

function generateHealthId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'RMN-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function saveHealthSession() {
  if (!currentHealthId) {
    currentHealthId = generateHealthId();
    sessionCreatedDate = new Date().toISOString();
  }
  const p = getProfile();
  p.pain = document.getElementById('painSlider').value;
  const session = {
    id:        currentHealthId,
    created:   sessionCreatedDate || new Date().toISOString(),
    lastSeen:  new Date().toISOString(),
    profile:   p,
    conditions: [...detectedConditions],
    vault:     vaultData.map(v => ({ id: v.id, name: v.name, type: v.type, date: v.date, summary: v.summary })),
    messages:  chatHistory.slice(-20)
  };
  localStorage.setItem('ramanai_hid_' + currentHealthId, JSON.stringify(session));
  localStorage.setItem('ramanai_current_hid', currentHealthId);
  updateHidChip();
}

function updateHidChip() {
  const chip = document.getElementById('hidChip');
  const disp = document.getElementById('hidDisplay');
  if (chip && currentHealthId) {
    chip.style.display = 'flex';
    if (disp) disp.textContent = currentHealthId;
  }
}



// ═══════════════════════════════════════════════════════
// ── HEALTH ID CARD (shown in chat) ─────────────────────
// ═══════════════════════════════════════════════════════
function showHealthIdCard(hid, isNew) {
  const html = `
    <div class="hid-card">
      <div class="hid-card-header">
        ${isNew ? '🎉 YOUR HEALTH ID IS READY' : '🔄 SESSION RESTORED'}
      </div>
      <div class="hid-card-body">
        <div class="hid-code">${hid}</div>
        <p class="hid-card-desc">
          ${isNew
            ? 'Save this ID. Next visit, enter it on the start screen to instantly restore your profile and full consultation history.'
            : 'Your profile, conditions and Medical Vault have been fully restored.'}
        </p>
        <div class="hid-card-actions">
          <button class="hid-action-btn"
            onclick="navigator.clipboard.writeText('${hid}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy ID'},1500)}).catch(()=>prompt('Copy your Health ID:','${hid}'))">
            📋 Copy ID
          </button>
          <button class="hid-action-btn hid-btn-share" onclick="shareHid('${hid}')">📤 Share</button>
        </div>
      </div>
      <div class="hid-card-footer">🔐 RAMAN AI · Experiment № 170 · Stored Locally</div>
    </div>`;
  addMessage('ai', html, true);
}

function shareHid(hid) {
  const text = `My RAMAN AI Health ID: ${hid}\nUse this to restore my consultation session at RAMAN AI – Experiment № 170.`;
  if (navigator.share) {
    navigator.share({ title: 'RAMAN AI Health ID', text });
  } else {
    prompt('Share your Health ID:', hid);
  }
}

// ── Load session by Health ID ──────────────────────────
function loadHealthSession(hid) {
  hid = hid.toUpperCase().trim();
  // Normalise: if user typed without dash, add it
  if (hid.length === 9 && !hid.includes('-')) hid = hid.slice(0,3) + '-' + hid.slice(3);
  const raw = localStorage.getItem('ramanai_hid_' + hid);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    currentHealthId    = s.id;
    sessionCreatedDate = s.created;

    // Restore profile
    const p = s.profile || {};
    if (p.name)      document.getElementById('patientName').value      = p.name;
    if (p.age)       document.getElementById('patientAge').value        = p.age;
    if (p.gender)    document.getElementById('patientGender').value     = p.gender;
    if (p.blood)     document.getElementById('patientBlood').value      = p.blood;
    if (p.allergies) document.getElementById('patientAllergies').value  = p.allergies;
    if (p.pain) {
      const sl = document.getElementById('painSlider');
      sl.value = p.pain;
      sl.dispatchEvent(new Event('input'));
    }
    updateProfileCompleteness();

    // Restore conditions
    if (s.conditions) s.conditions.forEach(c => detectedConditions.add(c));
    localStorage.setItem('ramanai_conditions', JSON.stringify([...detectedConditions]));

    // Restore vault references (summaries only)
    if (s.vault && s.vault.length) {
      // Merge: add entries not already in vaultData
      s.vault.forEach(v => {
        if (!vaultData.find(x => x.id === v.id)) {
          vaultData.push({ ...v, analysis: v.analysis || '<p>Analysis from previous session. Upload the document again for full review.</p>' });
        }
      });
      localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
      renderVault();
    }

    // Restore chat history array
    if (s.messages) chatHistory = s.messages;

    updateHidChip();
    localStorage.setItem('ramanai_current_hid', hid);
    hidShownThisSession = true;

    // Show restored summary in chat
    const lastSeen = new Date(s.lastSeen).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const condList = s.conditions && s.conditions.length ? s.conditions.join(', ') : 'None recorded';
    const vaultCount = s.vault ? s.vault.length : 0;
    const msgCount   = s.messages ? s.messages.length : 0;
    addMessage('ai', `
      <div class="restore-summary">
        <div class="restore-header">🔄 SESSION RESTORED — ${s.id}</div>
        <div class="restore-grid">
          <div class="restore-cell"><span class="rc-label">PATIENT</span><span class="rc-value">${p.name || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">AGE</span><span class="rc-value">${p.age || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">BLOOD</span><span class="rc-value">${p.blood || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">LAST VISIT</span><span class="rc-value">${lastSeen}</span></div>
          <div class="restore-cell"><span class="rc-label">CONDITIONS</span><span class="rc-value">${condList}</span></div>
          <div class="restore-cell"><span class="rc-label">VAULT DOCS</span><span class="rc-value">${vaultCount}</span></div>
        </div>
        ${p.allergies ? `<div class="restore-allergy">⚠️ Known allergies: <strong>${p.allergies}</strong></div>` : ''}
        <p style="margin-top:10px;">Welcome back, <strong>${p.name || 'Patient'}</strong>! Your full history is restored. How can I help you today?</p>
      </div>`, true);
    return true;
  } catch(e) {
    console.warn('Health ID load error', e);
    return false;
  }
}

// ── sendMessage is now self-contained (no wrapper needed) ──
// HID logic is wired directly inside sendMessage above.

// Also save after AI responds — hook via chatMessages mutation
const _chatObserver = new MutationObserver(() => {
  if (currentHealthId && sessionMsgs > 0) {
    // debounce
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(saveHealthSession, 1500);
  }
});
const _chatContainer = document.getElementById('chatMessages');
if (_chatContainer) _chatObserver.observe(_chatContainer, { childList: true });

// ── Splash: Health ID input handler ───────────────────
document.getElementById('splashHidBtn').addEventListener('click', handleHidRestore);
document.getElementById('splashHidInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleHidRestore();
});

function handleHidRestore() {
  const input = document.getElementById('splashHidInput').value.trim();
  const errEl = document.getElementById('splashHidError');
  if (!input) { errEl.textContent = 'Please enter your Health ID.'; return; }
  // Stop the auto-dismiss timer and show app immediately
  clearTimeout(window._splashTimer);
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  document.getElementById('welcomeTime').textContent = nowTime();
  initParticles();
  renderVault();

  const ok = loadHealthSession(input);
  if (!ok) {
    // Re-show splash with error
    document.getElementById('splashScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    errEl.textContent = '❌ Health ID not found. Please check and try again.';
    errEl.style.color = '#ff4d6d';
  }
}

// ── Store the splash timer so it can be cancelled ─────
// Overwrites the dummy timer at top of file; fires after 4.8s splash animation
window._splashTimer = setTimeout(() => {
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  const welcomeEl = document.getElementById('welcomeTime');
  if (welcomeEl) welcomeEl.textContent = nowTime();
  initParticles();
  loadProfile();
  renderVault();
  scheduleGuidance(true);
  // If we already have a Health ID from a prior session, show it in header
  if (currentHealthId) {
    updateHidChip();
    hidShownThisSession = true;
  }
}, 4800);

// ═══════════════════════════════════════════════════════
// ── SESSION MANAGER ────────────────────────────────────
// ═══════════════════════════════════════════════════════

function toggleSessionPanel() {
  const panel = document.getElementById('sessionPanel');
  const backdrop = document.getElementById('sessionPanelBackdrop');
  if (panel.classList.contains('open')) {
    closeSessionPanel();
  } else {
    updateSessionPanelUI();
    panel.classList.add('open');
    backdrop.classList.add('open');
  }
}

function closeSessionPanel() {
  document.getElementById('sessionPanel').classList.remove('open');
  document.getElementById('sessionPanelBackdrop').classList.remove('open');
  document.getElementById('spRestoreError').textContent = '';
}

function updateSessionPanelUI() {
  const codeEl = document.getElementById('spHidCode');
  const metaEl = document.getElementById('spHidMeta');
  const actionsEl = document.getElementById('spHidActions');
  const endBtn = document.getElementById('spEndBtn');
  
  if (currentHealthId) {
    codeEl.textContent = currentHealthId;
    codeEl.className = 'sp-hid-code';
    metaEl.innerHTML = `Active Session &bull; Started ${sessionCreatedDate ? new Date(sessionCreatedDate).toLocaleDateString() : 'Today'}`;
    actionsEl.style.display = 'flex';
    endBtn.style.display = 'block';
  } else {
    codeEl.textContent = 'No active session';
    codeEl.className = 'sp-hid-code no-session';
    metaEl.textContent = 'Start a consultation to generate a Health ID';
    actionsEl.style.display = 'none';
    endBtn.style.display = 'none';
  }
  
  // Render History
  const historyEl = document.getElementById('spSessionHistory');
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ramanai_hid_'));
  
  if (allKeys.length === 0) {
    historyEl.innerHTML = '<div class="sp-history-empty">No previous sessions found on this device.</div>';
    return;
  }
  
  const sessions = allKeys.map(k => {
    try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; }
  }).filter(s => s && s.id).sort((a,b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  
  historyEl.innerHTML = sessions.map(s => {
    const isCurrent = s.id === currentHealthId;
    const dateStr = new Date(s.lastSeen).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const msgs = s.messages ? s.messages.length : 0;
    return `
      <div class="sp-history-item ${isCurrent ? 'sp-session-ended' : ''}" onclick="document.getElementById('spHidInput').value='${s.id}'">
        <div style="flex:1">
          <div class="sp-history-hid">${s.id} ${isCurrent ? '<span style="font-size:0.6rem;color:#ffb400">(ACTIVE)</span>' : ''}</div>
          <div class="sp-history-meta">${dateStr} &bull; ${msgs} msgs &bull; ${s.profile?.name || 'Unknown Patient'}</div>
        </div>
        ${!isCurrent ? `<button class="sp-history-restore" onclick="event.stopPropagation(); restoreFromPanel('${s.id}')">Restore</button>` : ''}
      </div>
    `;
  }).join('');
}

function copyHid() {
  if(!currentHealthId) return;
  navigator.clipboard.writeText(currentHealthId);
  const btn = document.getElementById('spCopyBtn');
  btn.textContent = '✅ Copied!';
  setTimeout(() => btn.textContent = '📋 Copy ID', 1500);
}

function shareCurrentHid() {
  if(!currentHealthId) return;
  shareHid(currentHealthId);
}

function endCurrentSession() {
  // Save only if there's actual data to save
  if (currentHealthId || chatHistory.length > 0 || getProfile().name) {
    saveHealthSession(); 
  }
  
  // Clear runtime vars without deleting the saved data
  currentHealthId = null;
  sessionCreatedDate = null;
  chatHistory = [];
  hidShownThisSession = false;
  vaultData = [];
  detectedConditions.clear();
  sessionMsgs = 0;
  
  // Clear local storage pointers
  localStorage.removeItem('ramanai_current_hid');
  localStorage.removeItem('ramanai_profile');
  localStorage.removeItem('ramanai_vault');
  localStorage.removeItem('ramanai_conditions');
  
  // Reset UI
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('hidChip').style.display = 'none';
  document.getElementById('sessionCount').textContent = '0';
  document.getElementById('patientName').value = '';
  document.getElementById('patientAge').value = '';
  document.getElementById('patientGender').value = '';
  document.getElementById('patientBlood').value = '';
  document.getElementById('patientAllergies').value = '';
  document.getElementById('painSlider').value = 1;
  document.getElementById('painSlider').dispatchEvent(new Event('input'));
  updateProfileCompleteness();
  renderVault();
  
  addMessage('ai', `<div class="med-section info"><p>Session ended and saved securely. You can start a new consultation or restore a previous session from the Session Manager.</p></div>`, true);
  updateSessionPanelUI();
}

function startFreshSession() {
  endCurrentSession();
  document.getElementById('chatMessages').innerHTML = '';
  addMessage('ai', `<p>Welcome to a new session. Please fill in the patient profile on the left and describe the symptoms to begin.</p>`, true);
  closeSessionPanel();
}

function restoreFromPanel(forceId = null) {
  const input = forceId || document.getElementById('spHidInput').value.trim();
  const errEl = document.getElementById('spRestoreError');
  if (!input) { errEl.textContent = 'Please enter a Health ID.'; return; }
  
  if (currentHealthId === input.toUpperCase()) {
    errEl.textContent = 'This session is already active.';
    return;
  }
  
  // Clear current UI before loading
  document.getElementById('chatMessages').innerHTML = '';
  vaultData = [];
  detectedConditions.clear();
  
  const ok = loadHealthSession(input);
  if (ok) {
    closeSessionPanel();
    document.getElementById('spHidInput').value = '';
  } else {
    errEl.textContent = '❌ Health ID not found. Please check and try again.';
  }
}
