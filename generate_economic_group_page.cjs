const fs = require('fs');

let content = fs.readFileSync('components/MasterGroupDetailsPage.tsx', 'utf-8');

content = content.replace(/MasterGroup/g, 'EconomicGroup');
content = content.replace(/masterGroup/g, 'economicGroup');
content = content.replace(/Master Group/gi, 'Grupo Econômico');
content = content.replace(/master-group/g, 'economic-group');
content = content.replace(/master grupo/gi, 'grupo econômico');
content = content.replace(/Master grupo/gi, 'Grupo econômico');
content = content.replace(/MasterGroupContact/g, 'Contact');

fs.writeFileSync('components/EconomicGroupDetailsPage.tsx', content, 'utf-8');
console.log('Created components/EconomicGroupDetailsPage.tsx');
