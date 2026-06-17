const fs = require('fs');
const path = require('path');

const replacementMap = {
  'text-xs': 'text-[14px]',
  'text-sm': 'text-[16px]',
  'text-base': 'text-[18px]',
  'text-lg': 'text-[20px]',
  'text-xl': 'text-[22px]'
};

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        processDir(fullPath);
      }
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      
      content = content.replace(/\b(text-(?:xs|sm|base|lg|xl))\b/g, (match, p1) => {
        return replacementMap[p1] || p1;
      });

      if (original !== content) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated', fullPath);
      }
    }
  }
}

processDir(path.join(process.cwd(), 'components'));
processDir(path.join(process.cwd(), 'app'));
console.log('Done standard classes.');
