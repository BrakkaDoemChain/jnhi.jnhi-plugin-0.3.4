const webfont = require('webfont');
const fs = require('fs');
const path = require('path');

async function generateFont() {

  try {
    const result = await webfont.webfont({
      files: "./icons/*.svg",
      formats: ['woff'],
      startUnicode: 0xE000,
      verbose: true,
      normalize: true,
      sort: false
    });
    const dest = path.join(__dirname, '..', 'theme', 'vscode-10.woff')
    fs.writeFileSync(dest, result.woff, 'binary');
    console.log(`Font created at ${dest}`);
  } catch (e) {
    console.error('Font creation failed.', error);
  }
}

generateFont();


