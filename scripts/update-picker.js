const fs = require('fs');

// Read the updated emoji data
const emojiDataContent = fs.readFileSync('frontend/src/lib/emoji-data.ts', 'utf-8');
const objectStart = emojiDataContent.indexOf('= {') + 1;
const objectEnd = emojiDataContent.lastIndexOf('};') + 1;
const emojiDataString = emojiDataContent.substring(objectStart, objectEnd);

const EMOJI_DATA = eval('(' + emojiDataString + ')');


// Read the EmojiPicker component
let emojiPickerContent = fs.readFileSync('frontend/src/components/EmojiPicker.tsx', 'utf-8');

// These are the new emojis that we've identified as missing
const newEmojis = {
    'Smileys & People': ['🥹', '🩷', '🩵', '🩶', '🫨', '😶‍🌫️', '😮‍💨', '😵‍💫', '🧑‍🦰', '🧑‍🦱', '🧑‍🦳', '🧑‍🦲', '👱', '👱‍♂️', '👱‍♀️', '🧔', '🧔‍♂️', '🧔‍♀️', '🧑', '👨', '👩', '🧑‍🦰', '👨‍🦰', '👩‍🦰', '🧑‍🦱', '👨‍🦱', '👩‍🦱', '🧑‍🦳', '👨‍🦳', '👩‍🦳', '🧑‍🦲', '👨‍🦲', '👩‍🦲', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '🧏‍♀️', '🙇', '🙇‍♂️', '🙇‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒', '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️', '👷‍♀️', '🫅', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️', '👰', '👰‍♂️', '👰‍♀️', '🤰', '🫃', '🫄', '🤱', '👩‍🍼', '👨‍🍼', '🧑‍🍼', '🧑‍🤝‍🧑'],
    'Animals & Nature': ['🪸', '🐦‍⬛', '🕊', '🪴'],
    'Food & Drink': ['🫘', '🫗'],
    'Activities & Sports': ['🛟', '🪬'],
    'Travel & Places': ['🛞', '🪩', '🪪'],
    'Objects': ['🪫', '🩻', '🪧', '🪚', '🪛', '🪝', '🪜', '🪞', '🪟', '🪠', '🪤', '🪣', '🫧', '🪥', '🪦'],
    'Symbols': ['🟰', '♾️']
  };

for (const category in newEmojis) {
  const categoryRegex = new RegExp(`'${category}': \\[([\\s\\S]*?)\\]`, 'g');
  emojiPickerContent = emojiPickerContent.replace(categoryRegex, (match, p1) => {
    // @ts-ignore
    const existingEmojis = p1.match(/'(.*?)'/g) || [];
    // @ts-ignore
    const allEmojis = [...existingEmojis, ...newEmojis[category].map(e => `'${e}'`)];
    const uniqueEmojis = [...new Set(allEmojis)];
    
    let result = `'${category}': [\n`;
    let line = '    ';
    for (const emoji of uniqueEmojis) {
      if (line.length + emoji.length + 2 > 100) {
        result += line + '\n';
        line = '    ';
      }
      line += `${emoji}, `;
    }
    result += line.slice(0, -2) + '\n  ]';
    return result;
  });
}

fs.writeFileSync('frontend/src/components/EmojiPicker.tsx', emojiPickerContent);

console.log('Updated frontend/src/components/EmojiPicker.tsx with new emojis.'); 