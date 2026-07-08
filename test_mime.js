const sharp = require('sharp');
const fs = require('fs');

async function test() {
    const base64png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const dataUri = `data:image/png;base64,${base64png}`;
    
    // Using xlink:href
    const svgContent1 = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image x="50" y="50" width="100" height="100" xlink:href="${dataUri}" />
</svg>`;
    
    // Using href
    const svgContent2 = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <image x="50" y="50" width="100" height="100" href="${dataUri}" />
</svg>`;

    try {
        const b1 = await sharp(Buffer.from(svgContent1)).png().toBuffer();
        console.log("Image 1 (xlink:href) length:", b1.length);
        const b2 = await sharp(Buffer.from(svgContent2)).png().toBuffer();
        console.log("Image 2 (href) length:", b2.length);
    } catch(e) {
        console.error("Sharp error:", e);
    }
}
test();
