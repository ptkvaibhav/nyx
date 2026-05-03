import path from "node:path";

export const DEFAULT_FOLDERS_BY_CATEGORY = {
  archive: ["Archives"],
  code: ["Code"],
  document: ["Documents"],
  image: ["Photos"],
  other: ["Unsorted"],
  video: ["Videos"]
};

export const PURPOSE_RULES = [
  {
    purpose: "resume",
    expectedFolders: ["Resumes"],
    renameLabel: "Resume",
    pattern: /(^|[\s._-])(resume|cv|cover-letter)([\s._-]|$)/i
  },
  {
    purpose: "travel-ticket",
    expectedFolders: ["Tickets"],
    renameLabel: "Travel_Ticket",
    pattern: /(^|[\s._-])(ticket|flight|train|boarding|itinerary|booking|cleartrip)([\s._-]|$)/i
  },
  {
    purpose: "finance",
    expectedFolders: ["Finance"],
    renameLabel: "Finance_Record",
    pattern: /\b(invoice|receipt|tax|pay[\s._-]?slip|statement|e[\s._-]?statement|transactions?|account[\s._-]?transactions?|account|bank|epfo|nomination|salary|compensation|increment|hike|ctc)\b/i
  },
  {
    purpose: "insurance",
    expectedFolders: ["Finance/Insurance"],
    renameLabel: "Insurance_Policy",
    pattern: /\b(insurance|policy|premium|hdfc[\s._-]?life|lic|max[\s._-]?life|star[\s._-]?health)\b/i
  },
  {
    purpose: "utility",
    expectedFolders: ["Finance/Utilities"],
    renameLabel: "Utility_Bill",
    pattern: /\b(electricity|water|gas|broadband|wifi|internet|jio|airtel|bill|recharge)\b/i
  },
  {
    purpose: "identity",
    expectedFolders: ["Identity"],
    renameLabel: "Identity_Document",
    pattern: /(^|[\s._-])(e-?aadhaar|eaadhaar|aadhaar|aadhar|e-?pan|epan|pan|passport|license|voter)([\s._-]|$)/i
  },
  {
    purpose: "education",
    expectedFolders: ["Education"],
    renameLabel: "Education_Record",
    pattern: /(transcript|certificate|marksheet|diploma|degree|coursera|uc-[a-f0-9-]+)/i
  },
  {
    purpose: "legal",
    expectedFolders: ["Legal"],
    renameLabel: "Legal_Record",
    pattern: /(^|[\s._-])(contract|agreement|nda|lease|offer|docusign|employment|joining|relieving|experience)([\s._-]|$)/i
  },
  {
    purpose: "project",
    expectedFolders: ["Projects"],
    renameLabel: "Project_Document",
    pattern: /(^|[\s._-])(project|plan|roadmap|implementation|proposal|artifact|portfolio)([\s._-]|$)/i
  },
  {
    purpose: "installer",
    expectedFolders: ["Installers"],
    renameLabel: "Installer",
    pattern: /(^|[\s._-])(setup|installer|install|portable|vmware|virtualbox)([\s._-]|$)/i
  }
];

// Supports: _v1, -v1, .v1, (1), - Copy, - Copy (1)
export const VERSION_PATTERN = /([._-]v(\d+))|(\((\d+)\))|([- ]Copy( \((\d+)\))?)$/i;

export const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".html", ".css", ".sql", ".sh", ".bat", ".ps1", ".yml", ".yaml", ".json", ".xml", ".md", ".sol"
]);

export function inferPurposeDetails({ absolutePath = "", baseName = "", extension = "", category = "other", extractedText = "" }) {
  const normalizedBaseName = String(baseName || path.basename(absolutePath)).toLowerCase();
  const normalizedExtension = String(extension || path.extname(absolutePath)).toLowerCase();
  
  // Specific Deep Content Rule: Form 16 Segregation
  if (normalizedBaseName.includes("f16") || normalizedBaseName.includes("form 16") || /form\s*no\.?\s*16/i.test(extractedText)) {
    // Try to extract Assessment Year from text (e.g. "Assessment Year: 2024-25" or "Assessment Year 2024-25")
    let yearMatch = extractedText.match(/Assessment Year[:\s]*(\d{4}-\d{2})/i) || extractedText.match(/(\d{4}-\d{2})/);
    // Fallback to year in filename
    if (!yearMatch) {
       yearMatch = normalizedBaseName.match(/(\d{4}-\d{2})/);
    }
    
    let folder = "Finance/Form_16";
    if (yearMatch) {
       // Convert '2024-25' to '2024' or keep '2024-25'
       const yearStr = yearMatch[1]; 
       const startYear = yearStr.split('-')[0];
       folder = `Finance/Form_16/${startYear}`;
    }

    return {
      purpose: "finance",
      expectedFolders: [folder],
      matchedByRule: true,
      renameLabel: "Form_16"
    };
  }

  // If it's a known code extension, prefer the code category/purpose to avoid keyword misclassification
  if (CODE_EXTENSIONS.has(normalizedExtension)) {
    return {
      purpose: "code",
      expectedFolders: DEFAULT_FOLDERS_BY_CATEGORY.code,
      matchedByRule: false,
      renameLabel: null
    };
  }

  for (const rule of PURPOSE_RULES) {
    if (rule.pattern.test(normalizedBaseName)) {
      return {
        purpose: rule.purpose,
        expectedFolders: rule.expectedFolders,
        matchedByRule: true,
        renameLabel: rule.renameLabel
      };
    }
  }

  if ([".exe", ".msi", ".dmg", ".pkg", ".appx"].includes(normalizedExtension)) {
    return {
      purpose: "installer",
      expectedFolders: ["Installers"],
      matchedByRule: true,
      renameLabel: "Installer"
    };
  }

  return {
    purpose: category,
    expectedFolders: DEFAULT_FOLDERS_BY_CATEGORY[category] ?? DEFAULT_FOLDERS_BY_CATEGORY.other,
    matchedByRule: false,
    renameLabel: null
  };
}
