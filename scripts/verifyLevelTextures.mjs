/**
 * Verify level texture pixel values
 */

import { createCanvas, loadImage } from 'canvas';

async function verifyTexture(path) {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  const uniqueValues = new Set();
  for (let i = 0; i < imageData.data.length; i += 4) {
    uniqueValues.add(imageData.data[i]);
  }

  console.log(`${path}:`);
  console.log('Unique R channel values:', Array.from(uniqueValues).sort((a,b) => a-b));
  console.log('');
}

verifyTexture('public/levels/empty/particles.png');
verifyTexture('public/levels/sandbox/particles.png');
