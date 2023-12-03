import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { formatHex, converter } from 'culori';
const userColors = JSON.parse( 
  fs.readFileSync(path.normalize('src/userCreations.json'), 'utf8') 
).colors;

const rgbconv = converter('rgb');

// generated using chat gpt need help from a native speaker
function toSpanishTitleCase(title) {
    const smallWords = /^(y|e|u|o|a|en|de|del|las|los|con)$/i;
  
    function capitalizeFirstWord(word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  
    function processWord(word, index) {
        return (index === 0 || !smallWords.test(word.toLowerCase())) ?
            capitalizeFirstWord(word) :
            word.toLowerCase();
    }
  
    const titleWords = title.split(/\s+/);
    const processedWords = titleWords.map(processWord);
    const result = processedWords.join(' ');
  
    return result;
}

const pages = [
  {
    name: 'Wikipedia',
    sources: [
      'https://es.wikipedia.org/wiki/Anexo:Colores_por_orden_alfab%C3%A9tico',
    ],
    fn: _ => {
      const colorList = [];
      const colorTable = document.querySelector('.mw-content-ltr.mw-parser-output');
      const colorRows = colorTable.querySelectorAll('table ul li');

      for (let y = 0; y < colorRows.length; y++) {
        const colorRow = colorRows[y];

        const $link = colorRow.querySelector('a');
        const $colorSample = colorRow.querySelector('span');
        const name = $link.innerHTML.trim();
        
        if ($colorSample) { 
          const bgColor = $colorSample.style.backgroundColor;

          let link = $link.getAttribute('href');
          // if link does not start with http, it's a relative link
          // so we need to add the domain
          if (link && !link.startsWith('http')) {
            link = 'https://es.wikipedia.org' + link;
          }
          
          const hex = bgColor;
          colorList.push({
            name, hex, link,
          });
        } else {
          console.warn(`no color sample for ${name}`);
        }
      }

      return colorList;
    }
  },
];


let colors = [];

userColors.forEach(color => {
  colors.push({
    name: color.name,
    hex: color.hex,
    link: color.hasOwnProperty('link') ? color.link :
    `https://github.com/meodai/noms-de-couleur/#authors-${color.author}`,
  })  
});


(async () => {
  const browser = await puppeteer.launch();
  
  for (let j = 0; j < pages.length; j++) {
    for (let i = 0; i < pages[j].sources.length; i++) {
      const page = await browser.newPage();
      console.log(`visiting ${pages[j].sources[i]}`);
      await page.goto(pages[j].sources[i]);

      const colorList = await page.evaluate(pages[j].fn);
      colors = colors.concat(colorList);
    }
  }

  await browser.close();

  // data sanitization
  
  // title case each color name
  
  colors.forEach(c => {
    c.name = toSpanishTitleCase(c.name.replace(/’/g, "'").trim());
  });


  // sanitize hex values and names
  colors.forEach(c => {
    // remove parentheses and its contents from name
    c.name = c.name.replace(/\(.*\)/, '').trim();
    c.hex = formatHex(c.hex);
    if (!c.hex) {
      console.warn(`invalid hex: ${c.name} (${c.link})`);
    }
  });

  // remove duplicate names from colors list
  // while keeping the first occurence
  colors = colors.filter((c, i) => {
    const referenceName = c.name.toLowerCase().replace(/-/g, ' ').replace(/Œ/ig, 'oe');
    const index = colors.findIndex(
      c => c.name.toLowerCase()
                 .replace(/-/g, ' ')
                 .replace(/Œ/ig, 'oe')
                 .localeCompare(
                    referenceName
                  ) === 0
    );
    if (index === i) {
      return true;
    }
    return false;
  });

  // sort colors by name
  colors.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
  });

  // find duplicate hex values and warn about them
  const hexes = colors.map(c => c.hex);
  const duplicates = hexes.filter((h, i) => hexes.indexOf(h) !== i);
  if (duplicates.length > 0) {
    console.warn('found some duplicate hex values:');
    duplicates.forEach(d => {
      const dupes = colors.filter(c => c.hex === d);
      console.warn(`duplicate hex: ${d} (${dupes.map(c => c.name).join(', ')})`);
      // shift each subsequent duplicate color value by 1
      for (let i = 1; i < dupes.length; i++) {
        dupes[i].hex = shiftColor(dupes[i].hex, (1/255) * i);
      }
    });
  }
  // will probably need to do this recursively
  console.warn('Shifted all the color values a bit to make each color unique');

  function shiftColor(hex, shift) {
    const rgb = rgbconv(hex);
    rgb.r = rgb.r + shift;
    rgb.g = rgb.g + shift;
    rgb.b = rgb.b + shift;
    
    if (rgb.r > 1) {
      rgb.r = 2 - rgb.r;
    }
    if (rgb.g > 1) {
      rgb.g = 2 - rgb.g;
    }
    if (rgb.b > 1) {
      rgb.b = 2 - rgb.b;
    }

    return formatHex(rgb);
  }


  // update color count in readme.md
  // gets SVG template
  let mdTpl = fs.readFileSync(
    './readme.md',
    'utf8'
  ).toString();

  mdTpl = mdTpl.replace(/\(\*{2}(\d+)\*{2}\)/gm, `(**${colors.length}**)`);

  fs.writeFileSync(
    './readme.md',
    mdTpl
  );

  // create a csv file with the colors
  const csv = 'name,hex,link\n' + colors.map(c => `${c.name},${c.hex},${c.link}`).join('\n');
  
  fs.writeFileSync('./colors.csv', csv);
  fs.writeFileSync('./colors.min.json', JSON.stringify(colors));
  fs.writeFileSync('./colors.json', JSON.stringify(colors, null, 2));
})().catch(e => console.log(e));