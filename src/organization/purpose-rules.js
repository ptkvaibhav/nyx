import path from "node:path";

const DEFAULT_FOLDERS_BY_CATEGORY = {
  archive: ["Archives"],
  code: ["Code"],
  document: ["Documents"],
  image: ["Photos"],
  other: ["Unsorted"],
  video: ["Videos"]
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function extractDate(text, baseName, relativePath = "") {
  const combined = (text + " " + baseName + " " + relativePath).replace(/\n/g, ' ');
  
  const monthNames = "(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)";
  const monthYearRegex = new RegExp(monthNames + "\\s*,?\\s*-?\\s*(\\d{4}|\\d{2})(?:\\s|$|/|\\\\|\\.)", "i");
  let match = combined.match(monthYearRegex);
  if (match) {
    const mStr = match[1].toLowerCase().substring(0, 3);
    const mIndex = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(mStr);
    const yStr = match[2].length === 2 ? "20" + match[2] : match[2];
    return { year: yStr, month: String(mIndex + 1).padStart(2, '0') + "_" + MONTHS[mIndex] };
  }

  // Look for YYYY-MM or YYYY_MM
  match = combined.match(/20[0-2]\d[-_](0[1-9]|1[0-2])/);
  if (match) {
    const mIndex = parseInt(match[1], 10) - 1;
    return { year: match[0].substring(0,4), month: match[1] + "_" + MONTHS[mIndex] };
  }

  // Look for DD/MM/YYYY or DD-MM-YYYY
  match = combined.match(/(?:^|\D)([0-3]\d)[/.-](0[1-9]|1[0-2])[/.-](20[0-2]\d)(?:\D|$)/);
  if (match) {
    const mIndex = parseInt(match[2], 10) - 1;
    return { year: match[3], month: match[2] + "_" + MONTHS[mIndex] };
  }

  // Look for standalone year 2010-2029
  match = combined.match(/(?:^|\D)(20[1-2]\d)(?:\D|$)/);
  if (match) return { year: match[1], month: null };

  return { year: null, month: null };
}

const PURPOSE_RULES = [
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

export const VERSION_PATTERN = /([._-]v?(\d+([._]\d+)*))|(\\((\d+)\\))|([- ]Copy( \\((\d+)\\))?)$/i;

const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".html", ".css", ".sql", ".sh", ".bat", ".ps1", ".yml", ".yaml", ".json", ".xml", ".md", ".sol"
]);

export function inferPurposeDetails(fileProfile) {
  const { absolutePath = "", baseName = "", extension = "", category = "other", extractedText = "", isEntity = false, entityType = "", relativePath = "" } = fileProfile;
  
  if (isEntity) {
    if (entityType === "software_project") return { purpose: "code", expectedFolders: ["Projects"], matchedByRule: true, renameLabel: "Project" };
    if (entityType === "application") return { purpose: "installer", expectedFolders: ["Applications"], matchedByRule: true, renameLabel: "App" };
  }

  const normalizedBaseName = String(baseName || path.basename(absolutePath)).toLowerCase();
  const normalizedExtension = String(extension || path.extname(absolutePath)).toLowerCase();
  const normalizedRelativePath = String(relativePath || absolutePath).toLowerCase();
  
  const dateInfo = extractDate(extractedText, normalizedBaseName, relativePath || absolutePath);
  
  const pathContainsPaySlip = normalizedRelativePath.includes("pay slip") || normalizedRelativePath.includes("payslip") || normalizedRelativePath.includes("pay_slip");

  // Specific Deep Content Rule: Pay Slips
  if (/pay[\s._-]?slip/i.test(normalizedBaseName) || /salary[\s._-]?slip/i.test(normalizedBaseName) || /pay\s*slip/i.test(extractedText) || /salary\s*slip/i.test(extractedText) || pathContainsPaySlip) {
    let folder = "Finance/Pay_Slips";
    let label = "Pay_Slip";
    if (dateInfo.year) {
      folder += `/${dateInfo.year}`;
      label += `_${dateInfo.year}`;
      if (dateInfo.month) {
        folder += `/${dateInfo.month}`;
        label += `_${dateInfo.month.split('_')[1]}`;
      }
    }
    return { purpose: "finance", expectedFolders: [folder], matchedByRule: true, renameLabel: label };
  }

  // Specific Deep Content Rule: Form 16 / IT Returns
  if (normalizedBaseName.includes("f16") || normalizedBaseName.includes("form 16") || normalizedBaseName.includes("itcs") || /form\s*no\\.?\s*16/i.test(extractedText) || /income\s*tax\s*return/i.test(extractedText) || /it\s*computation/i.test(extractedText) || /income\s*tax\s*computation/i.test(extractedText) || /income\s*tax\s*computation/i.test(normalizedBaseName)) {
    let yearMatch = extractedText.match(/Assessment Year[:\s]*(\d{4}-\d{2})/i) || extractedText.match(/(\d{4}-\d{2})/);
    if (!yearMatch) yearMatch = normalizedBaseName.match(/(\d{4}-\d{2})/);
    let folder = "Finance/IT_Returns";
    let label = normalizedBaseName.includes("form") || /form/i.test(extractedText) ? "Form_16" : "IT_Computation";
    if (yearMatch) {
       const startYear = yearMatch[1].split('-')[0];
       folder += `/${startYear}`;
       label += `_${startYear}`;
    } else if (dateInfo.year) {
       folder += `/${dateInfo.year}`;
       label += `_${dateInfo.year}`;
    }
    return { purpose: "finance", expectedFolders: [folder], matchedByRule: true, renameLabel: label };
  }

  // Specific Deep Content Rule: EPF Statement
  if (/epf/i.test(normalizedBaseName) || /epfo/i.test(normalizedBaseName) || /provident\s*fund/i.test(extractedText) || /epfo\s*statement/i.test(extractedText)) {
    let folder = "Finance/EPF";
    let label = "EPF_Statement";
    if (dateInfo.year) {
       folder += `/${dateInfo.year}`;
       label += `_${dateInfo.year}`;
    }
    return { purpose: "finance", expectedFolders: [folder], matchedByRule: true, renameLabel: label };
  }

  // Specific Deep Content Rule: Bank Statement
  if (normalizedBaseName.includes("statement") || /account\s*statement/i.test(extractedText) || /bank\s*statement/i.test(extractedText) || (/account\s*summary/i.test(extractedText) && /balance/i.test(extractedText))) {
     let folder = "Finance/Bank_Statements";
     let label = "Bank_Statement";
     
     // Try to extract bank name
     let bankName = "";
     if (/hdfc/i.test(extractedText) || /hdfc/i.test(normalizedBaseName)) bankName = "HDFC";
     else if (/sbi/i.test(extractedText) || /state bank/i.test(extractedText) || /sbi/i.test(normalizedBaseName)) bankName = "SBI";
     else if (/icici/i.test(extractedText) || /icici/i.test(normalizedBaseName)) bankName = "ICICI";
     else if (/axis/i.test(extractedText) || /axis/i.test(normalizedBaseName)) bankName = "Axis";
     
     if (bankName) label = `${bankName}_Statement`;
     
     if (dateInfo.year) {
       folder += `/${dateInfo.year}`;
       label += `_${dateInfo.year}`;
       if (dateInfo.month) {
         folder += `/${dateInfo.month}`;
         label += `_${dateInfo.month.split('_')[1]}`;
       }
     }
     return { purpose: "finance", expectedFolders: [folder], matchedByRule: true, renameLabel: label };
  }

  // Specific Deep Content Rule: Aadhaar Card
  if (normalizedBaseName.includes("aadhaar") || /unique identification authority of india/i.test(extractedText) || (/government of india/i.test(extractedText) && /aadhaar/i.test(extractedText))) {
     return { purpose: "identity", expectedFolders: ["Identity/Aadhaar"], matchedByRule: true, renameLabel: "Aadhaar_Card" };
  }

  // Specific Deep Content Rule: PAN Card
  if ((normalizedBaseName.includes("pan") && !normalizedBaseName.includes("company")) || (/income tax department/i.test(extractedText) && /permanent account number/i.test(extractedText))) {
     return { purpose: "identity", expectedFolders: ["Identity/PAN"], matchedByRule: true, renameLabel: "PAN_Card" };
  }

  // Specific Deep Content Rule: Passport
  if (normalizedBaseName.includes("passport") || (/republic of india/i.test(extractedText) && /passport/i.test(extractedText))) {
     return { purpose: "identity", expectedFolders: ["Identity/Passport"], matchedByRule: true, renameLabel: "Passport" };
  }
  
  // Specific Deep Content Rule: Offer Letter
  if (/offer[\s._-]?letter/i.test(normalizedBaseName) || /appointment[\s._-]?letter/i.test(normalizedBaseName) || (/offer of employment/i.test(extractedText))) {
     let label = "Offer_Letter";
     if (dateInfo.year) label += `_${dateInfo.year}`;
     return { purpose: "legal", expectedFolders: ["Legal/Offer_Letters"], matchedByRule: true, renameLabel: label };
  }

  if (CODE_EXTENSIONS.has(normalizedExtension)) {
    return { purpose: "code", expectedFolders: DEFAULT_FOLDERS_BY_CATEGORY.code, matchedByRule: false, renameLabel: null };
  }

  for (const rule of PURPOSE_RULES) {
    if (rule.pattern.test(normalizedBaseName)) {
      return { purpose: rule.purpose, expectedFolders: rule.expectedFolders, matchedByRule: true, renameLabel: rule.renameLabel };
    }
  }

  if ([".exe", ".msi", ".dmg", ".pkg", ".appx"].includes(normalizedExtension)) {
    return { purpose: "installer", expectedFolders: ["Installers"], matchedByRule: true, renameLabel: "Installer" };
  }

  return { purpose: category, expectedFolders: DEFAULT_FOLDERS_BY_CATEGORY[category] ?? DEFAULT_FOLDERS_BY_CATEGORY.other, matchedByRule: false, renameLabel: null };
}
