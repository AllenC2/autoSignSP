const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');

async function test() {
    const base64png = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAEFJREFUKFNj/M/A8J+BIkAMVfX//3+Ghv///xvC9DNgE8OkkNTAkG/YQJbHZCijw2Rpi01vFPMYWc2kmcVIswkAiQhE+xR+w0wAAAAASUVORK5CYII='; // 10x10 red square
    const dataUri = `data:image/png;base64,${base64png}`;
    
    const svgContent = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <image x="50" y="50" width="100" height="100" href="${dataUri}" />
</svg>`;
    
    const resvg = new Resvg(svgContent);
    const pngData = resvg.render();
    const buffer = pngData.asPng();
    console.log("Image length:", buffer.length);
}
test();
