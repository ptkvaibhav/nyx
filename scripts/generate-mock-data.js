import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const basePath = path.join(process.cwd(), 'File');

const filesToCreate = [
  'Documents/Invoice_2024.pdf',
  'Documents/Resume_JohnDoe.pdf',
  'Documents/Resume_JohnDoe (1).pdf',
  'Photos/Vacation_2023.jpg',
  'Photos/Vacation_2023 - Copy.jpg',
  'Code/app.js',
  'Code/index.html',
  'Code/styles.css',
  'Legal/NDA_Signed.pdf',
  'Legal/NDA_Signed_v2.pdf',
  'Tickets/Flight_NYC_to_LAX.pdf',
  'Unsorted/random_notes.txt',
  'Unsorted/IMG_1234.jpg'
];

// Ensure base path exists
if (!fs.existsSync(basePath)) {
  fs.mkdirSync(basePath, { recursive: true });
}

// Create files with dummy content
filesToCreate.forEach(file => {
  const fullPath = path.join(basePath, file);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Use file path as content to ensure different hashes for different files,
  // but identical hashes for duplicates (if we want them to be duplicates, we need same content)
  let content = `Dummy content for ${path.basename(file)}`;
  
  // Make duplicates have identical content
  if (file.includes('(1)')) content = `Dummy content for Resume_JohnDoe.pdf`;
  if (file.includes('Copy')) content = `Dummy content for Vacation_2023.jpg`;
  
  fs.writeFileSync(fullPath, content);
  console.log(`Created: ${fullPath}`);
});

console.log('Mock data generation complete.');
