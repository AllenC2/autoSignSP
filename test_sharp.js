const sharp = require('sharp');
const fs = require('fs');

async function test() {
    const base64png = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAEFJREFUKFNj/M/A8J+BIkAMVfX//3+Ghv///xvC9DNgE8OkkNTAkG/YQJbHZCijw2Rpi01vFPMYWc2kmcVIswkAiQhE+xR+w0wAAAAASUVORK5CYII='; // 10x10 red square
    const dataUri = `data:image/png;base64,${base64png}`;
    
    const svg1 = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image x="50" y="50" width="100" height="100" xlink:href="${dataUri}" /></svg>`;
    const svg2 = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg"><image x="50" y="50" width="100" height="100" href="${dataUri}" /></svg>`;

    const b1 = await sharp(Buffer.from(svg1)).png().toBuffer();
    console.log("Image 1 (xlink:href) length:", b1.length);
    const b2 = await sharp(Buffer.from(svg2)).png().toBuffer();
    console.log("Image 2 (href) length:", b2.length);
}
test();
