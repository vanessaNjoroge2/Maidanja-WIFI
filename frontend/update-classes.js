const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;

  // Replace max-width wrappers
  content = content.replace(/max-w-7xl\s+mx-auto/g, 'container-responsive');
  
  // Clean up old padding if present with container-responsive
  content = content.replace(/px-margin-mobile\s+md:px-margin-desktop/g, '');
  // Clean up any double spaces left behind
  content = content.replace(/\s{2,}/g, ' ');

  // Replace various responsive grids with grid-auto-fit
  content = content.replace(/grid\s+grid-cols-1\s+(md|lg|xl):grid-cols-\d+(?:\s+(lg|xl):grid-cols-\d+)?/g, 'grid-auto-fit');
  content = content.replace(/grid\s+grid-cols-2\s+(lg|xl):grid-cols-\d+/g, 'grid-auto-fit');
  
  // Specific fix for checkout-success where classes were jumbled
  content = content.replace(/grid\s+grid-cols-1\s+md:grid-cols-3/g, 'grid-auto-fit');

  if (content !== original) {
    fs.writeFileSync(f, content);
    console.log('Updated grids/containers in ' + f);
  }
});
