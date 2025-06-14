const fs = require('fs');

// Read the existing emoji data
const existingEmojiData = fs.readFileSync('frontend/src/lib/emoji-data.ts', 'utf-8');

// Read the new emoji data
const newEmojiData = JSON.parse(fs.readFileSync('new-emoji-data.json', 'utf-8'));

// Get the keys from the existing data
const existingEmojiKeys = existingEmojiData.match(/'(.*?)':/g).map(key => key.replace(/'/g, '').replace(/:/g, ''));

// Find the missing emojis
const missingEmojis = {};
for (const emoji in newEmojiData) {
  if (!existingEmojiKeys.includes(emoji)) {
    // @ts-ignore
    missingEmojis[emoji] = newEmojiData[emoji];
  }
}

// Create the new data string
let newDataString = '';
for (const emoji in missingEmojis) {
  // @ts-ignore
  const data = missingEmojis[emoji];
  newDataString += `  '${emoji}': { name: '${data.name}', keywords: ['${data.keywords.join("', '")}'] },\n`;
}

// Add the new data to the existing file
const updatedEmojiData = existingEmojiData.replace('};', newDataString + '};');
fs.writeFileSync('frontend/src/lib/emoji-data.ts', updatedEmojiData);

console.log('Updated frontend/src/lib/emoji-data.ts with missing emojis.'); 