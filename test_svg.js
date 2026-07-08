const cheerio = require('cheerio');
const sharp = require('sharp');
const fs = require('fs');

async function test() {
    const svgContent = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <text x="50" y="50">{{Firma}}</text>
</svg>`;
    
    const $ = cheerio.load(svgContent, { xmlMode: true, decodeEntities: false });
    
    // Simulate image variable
    const key = 'Firma';
    const textNodes = $('text').filter(function() {
        return $(this).text().includes(`{{${key}}}`);
    });
    
    // Generate a tiny valid base64 png
    const base64png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const dataUri = `data:image/png;base64,${base64png}`;
    
    textNodes.each(function() {
        const x = $(this).attr('x') || 0;
        const y = $(this).attr('y') || 0;
        $(this).replaceWith(`<image x="${x}" y="${y}" width="100" height="100" href="${dataUri}" />`);
    });
    
    const modifiedSvg = $.xml();
    console.log("Modified SVG:", modifiedSvg);
    
    try {
        const buffer = await sharp(Buffer.from(modifiedSvg)).png().toBuffer();
        console.log("Image length:", buffer.length);
    } catch(e) {
        console.error("Sharp error:", e);
    }
}
test();
