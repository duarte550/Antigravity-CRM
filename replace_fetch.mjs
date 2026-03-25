import fs from 'fs';
import path from 'path';

function walk(dir, done) {
  let results = [];
  fs.readdir(dir, (err, list) => {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(file => {
      file = path.resolve(dir, file);
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
}

function processFiles() {
  const rootDir = process.cwd();
  const componentsDir = path.join(rootDir, 'components');
  
  walk(componentsDir, (err, files) => {
    if (err) throw err;
    files.push(path.join(rootDir, 'App.tsx'));
    files = files.filter(f => f.endsWith('.tsx'));
    
    files.forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      if (content.match(/\Wfetch\(/)) {
        // replace `fetch(` with `fetchApi(` 
        // considering boundaries avoid `fetchApi(`
        // Since we are replacing `fetch(` we can do something like:
        let newContent = content.replace(/(?<!\w)fetch\(/g, 'fetchApi(');
        
        // now add import
        if (!newContent.includes('import { fetchApi }')) {
            const importPath = file === path.join(rootDir, 'App.tsx') ? './utils/api' : '../utils/api';
            const importStatement = `import { fetchApi } from '${importPath}';\n`;
            
            // find last import or start
            const lastImportIndex = newContent.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
                 const nextLineIndex = newContent.indexOf('\n', lastImportIndex);
                 newContent = newContent.slice(0, nextLineIndex + 1) + importStatement + newContent.slice(nextLineIndex + 1);
            } else {
                 newContent = importStatement + newContent;
            }
        }
        
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated ${file}`);
      }
    });
  });
}

processFiles();
