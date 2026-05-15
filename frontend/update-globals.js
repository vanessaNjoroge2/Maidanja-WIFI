const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (!content.includes('globals.css')) {
    content = content.replace('</head>', '    <link rel="stylesheet" href="/css/globals.css" />\n  </head>');
    fs.writeFileSync(f, content);
    console.log('Updated ' + f);
  }
});
