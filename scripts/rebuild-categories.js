const fs = require('fs');
const fetch = require('node-fetch');

const EMOJI_PICKER_PATH = 'frontend/src/components/EmojiPicker.tsx';

async function rebuildCategories() {
  console.log('Fetching emoji data from unicode.org...');
  const response = await fetch('https://unicode.org/Public/emoji/15.0/emoji-test.txt');
  const text = await response.text();
  const lines = text.split('\n');

  const categories = {
    'Smileys & People': [],
    'Animals & Nature': [],
    'Food & Drink': [],
    'Activities & Sports': [],
    'Travel & Places': [],
    'Objects': [],
    'Symbols': [],
    'Flags': [],
  };

  let currentGroup = '';

  for (const line of lines) {
    if (line.startsWith('# group:')) {
      currentGroup = line.substring('# group:'.length).trim();
      continue;
    }

    if (line.includes('; fully-qualified') && !line.includes('skin tone')) {
      const emojiMatch = line.match(/#\s(.*?)\sE[0-9]/);
      if (emojiMatch) {
        const emoji = emojiMatch[1].trim();
        let targetCategory = null;

        if (currentGroup === 'Smileys & Emotion' || currentGroup === 'People & Body' || currentGroup === 'Component') {
          targetCategory = 'Smileys & People';
        } else if (currentGroup === 'Animals & Nature') {
          targetCategory = 'Animals & Nature';
        } else if (currentGroup === 'Food & Drink') {
          targetCategory = 'Food & Drink';
        } else if (currentGroup === 'Travel & Places') {
          targetCategory = 'Travel & Places';
        } else if (currentGroup === 'Activities') {
          targetCategory = 'Activities & Sports';
        } else if (currentGroup === 'Objects') {
          targetCategory = 'Objects';
        } else if (currentGroup === 'Symbols') {
          targetCategory = 'Symbols';
        } else if (currentGroup === 'Flags') {
          targetCategory = 'Flags';
        }

        if (targetCategory && categories[targetCategory]) {
          categories[targetCategory].push(emoji);
        }
      }
    }
  }
  
  // The unicode data doesn't contain all person emojis with hair/gender variations,
  // let's add them manually to the 'Smileys & People' category if they are missing.
  const personEmojis = [
    '🧑‍🦰', '🧑‍🦱', '🧑‍🦳', '🧑‍🦲', '👱', '👱‍♂️', '👱‍♀️', '🧔', '🧔‍♂️', '🧔‍♀️', '🧑', '👨', '👩', '👨‍🦰', '👩‍🦰',
    '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '👨‍🦲', '👩‍🦲', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅',
    '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '𧏏‍♀️',
    '🙇', '🙇‍♂️', '🙇‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓',
    '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧',
    '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻',
    '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒',
    '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️',
    '👷‍♀️', '🫅', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️', '👰', '👰‍♂️', '👰‍♀️',
    '🤰', '🫃', '🫄', '🤱', '👩‍🍼', '👨‍🍼', '🧑‍🍼', '🧑‍🤝‍🧑'
  ];

  for (const emoji of personEmojis) {
    if (!categories['Smileys & People'].includes(emoji)) {
      categories['Smileys & People'].push(emoji);
    }
  }

  console.log('Rebuilding EMOJI_CATEGORIES object...');
  let newCategoriesObject = `const EMOJI_CATEGORIES = {\n  'All': Object.keys(EMOJI_DATA),\n`;
  for (const category in categories) {
    const emojis = categories[category].map(e => `'${e}'`).join(', ');
    newCategoriesObject += `  '${category}': [${emojis}],\n`;
  }
  newCategoriesObject += '};';

  console.log(`Reading existing file: ${EMOJI_PICKER_PATH}`);
  const pickerContent = fs.readFileSync(EMOJI_PICKER_PATH, 'utf-8');

  const updatedPickerContent = pickerContent.replace(
    /const EMOJI_CATEGORIES = {[\s\S]*?};/,
    newCategoriesObject
  );

  console.log(`Writing updated content to ${EMOJI_PICKER_PATH}`);
  fs.writeFileSync(EMOJI_PICKER_PATH, updatedPickerContent);

  console.log('Successfully rebuilt and updated emoji categories.');
}

rebuildCategories().catch(console.error); 