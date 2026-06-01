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
    pattern: /(^|[\s._-])(resume|cv|curriculum-vitae|cover-letter)([\s._-]|$)/i
  },
  {
    purpose: "travel-ticket",
    expectedFolders: ["Tickets"],
    renameLabel: "Travel_Ticket",
    pattern: /(^|[\s._-])(ticket|flight|train|irctc|boarding|itinerary|booking|cleartrip|makemytrip)([\s._-]|$)/i
  },
  {
    purpose: "finance",
    expectedFolders: ["Finance"],
    renameLabel: "Finance_Record",
    pattern: /(^|[\s._-])(invoice|receipt|tax-?form|pay[\s._-]?slip|salary[\s._-]?slip|epfo-?statement|bank[\s._-]?statement|account[\s._-]?statement|transactions?|nomination-?form|ctc-?letter|increment-?letter)([\s._-]|$)/i
  },
  {
    purpose: "insurance",
    expectedFolders: ["Finance/Insurance"],
    renameLabel: "Insurance_Policy",
    pattern: /(^|[\s._-])(insurance-?policy|premium-?receipt|hdfc[\s._-]?life|lic-?policy|max[\s._-]?life|star[\s._-]?health|policy-?document)([\s._-]|$)/i
  },
  {
    purpose: "utility",
    expectedFolders: ["Finance/Utilities"],
    renameLabel: "Utility_Bill",
    pattern: /(^|[\s._-])(electricity-?bill|gas-?bill|broadband-?bill|wifi-?bill|jio-?recharge|airtel-?bill|mobile-?bill|utility-?invoice)([\s._-]|$)/i
  },
  {
    purpose: "identity",
    expectedFolders: ["Identity"],
    renameLabel: "Identity_Document",
    pattern: /(^|[\s._-])(e-?aadhaar|eaadhaar|aadhaar-?card|aadhar-?card|e-?pan|epan|pan-?card|passport|driving-?license|voter-?id)([\s._-]|$)/i
  },
  {
    purpose: "education",
    expectedFolders: ["Education"],
    renameLabel: "Education_Record",
    pattern: /(^|[\s._-])(academic-?transcript|marksheet|degree-?certificate|provisional-?certificate|diploma|graduation|coursera-?certificate|udemy-?certificate)([\s._-]|$)/i
  },
  {
    purpose: "legal",
    expectedFolders: ["Legal"],
    renameLabel: "Legal_Record",
    pattern: /(^|[\s._-])(legal-?agreement|nda|non-?disclosure|lease-?deed|rental-?agreement|offer-?letter|appointment-?letter|relieving-?letter|experience-?certificate)([\s._-]|$)/i
  },
  {
    purpose: "project",
    expectedFolders: ["Projects"],
    renameLabel: "Project_Document",
    pattern: /(^|[\s._-])(project-?plan|roadmap|implementation-?guide|technical-?proposal|design-?artifact|portfolio-?item)([\s._-]|$)/i
  },
  {
    purpose: "installer",
    expectedFolders: ["Installers"],
    renameLabel: "Installer",
    pattern: /(^|[\s._-])(setup|installer|install|portable-?app|vmware-?app|virtualbox-?image|(.+)-setup)([\s._-]|$)/i
  }
];

// Supports: _v1, -v1, .v1, (1), - Copy, - Copy (1), 2024.4, 1.2.3
export const VERSION_PATTERN = /([._-]v?(\d+([._]\d+)*))|(\((\d+)\))|([- ]Copy( \((\d+)\))?)$/i;

export const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".html", ".css", ".sql", ".sh", ".bat", ".ps1", ".yml", ".yaml", ".json", ".xml", ".md", ".sol"
]);

export function inferPurposeDetails({ absolutePath = "", baseName = "", extension = "", category = "other", extractedText = "", isEntity = false, entityType = "" }) {
  // If it's a cohesive entity, categorize it immediately to prevent fragmentation
  if (isEntity) {
    if (entityType === "software_project") {
       return {
         purpose: "code",
         expectedFolders: ["Projects"],
         matchedByRule: true,
         renameLabel: "Project"
       };
    }
    if (entityType === "application") {
       return {
         purpose: "installer",
         expectedFolders: ["Applications"],
         matchedByRule: true,
         renameLabel: "App"
       };
    }
  }

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

  // Specific Deep Content Rule: Bank Statement
  if (normalizedBaseName.includes("statement") || /account\s*statement/i.test(extractedText) || /bank\s*statement/i.test(extractedText) || (/account\s*summary/i.test(extractedText) && /balance/i.test(extractedText))) {
     return {
       purpose: "finance",
       expectedFolders: ["Finance/Bank_Statements"],
       matchedByRule: true,
       renameLabel: "Bank_Statement"
     };
  }

  // Specific Deep Content Rule: Aadhaar Card
  if (normalizedBaseName.includes("aadhaar") || /unique identification authority of india/i.test(extractedText) || (/government of india/i.test(extractedText) && /aadhaar/i.test(extractedText))) {
     return {
       purpose: "identity",
       expectedFolders: ["Identity"],
       matchedByRule: true,
       renameLabel: "Aadhaar_Card"
     };
  }

  // Specific Deep Content Rule: PAN Card
  if ((normalizedBaseName.includes("pan") && !normalizedBaseName.includes("company")) || (/income tax department/i.test(extractedText) && /permanent account number/i.test(extractedText))) {
     return {
       purpose: "identity",
       expectedFolders: ["Identity"],
       matchedByRule: true,
       renameLabel: "PAN_Card"
     };
  }

  // Specific Deep Content Rule: Passport
  if (normalizedBaseName.includes("passport") || (/republic of india/i.test(extractedText) && /passport/i.test(extractedText))) {
     return {
       purpose: "identity",
       expectedFolders: ["Identity"],
       matchedByRule: true,
       renameLabel: "Passport"
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
