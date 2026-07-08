const sharp = require('sharp');
async function test() {
    const emptySvg = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg"></svg>`;
    const b = await sharp(Buffer.from(emptySvg)).png().toBuffer();
    console.log("Empty length:", b.length);
}
test();
