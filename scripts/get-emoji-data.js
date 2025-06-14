const fetch = require('node-fetch');
const fs = require('fs');

async function getEmojiData() {
  const response = await fetch('https://unicode.org/Public/emoji/15.0/emoji-test.txt');
  const text = await response.text();
  const lines = text.split('\n');
  
  const emojiData = {};
  
  for (const line of lines) {
    if (line.includes('; fully-qualified') && !line.includes('skin tone')) {
      const parts = line.split('#');
      if (parts.length > 1) {
        const emoji = parts[1].trim().split(' ')[0];
        const name = parts[1].trim().split(' ').slice(2).join(' ');
        
        if (emoji && name) {
          // @ts-ignore
          emojiData[emoji] = {
            name: name.replace(/_/, ' '),
            keywords: [name.replace(/_/, ' ')],
          };
        }
      }
    }
  }
  
  fs.writeFileSync('new-emoji-data.json', JSON.stringify(emojiData, null, 2));
  console.log('New emoji data saved to new-emoji-data.json');
}

getEmojiData(); 