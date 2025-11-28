import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const canvas = createCanvas(2048, 2048);
const ctx = canvas.getContext('2d');

// Create a gradient background
const gradient = ctx.createLinearGradient(0, 0, 2048, 2048);
gradient.addColorStop(0, '#ff00ff');
gradient.addColorStop(0.5, '#00ffff');
gradient.addColorStop(1, '#ffff00');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 2048, 2048);

// Draw a border around the entire 2048x2048 texture (RED)
ctx.strokeStyle = '#ff0000';
ctx.lineWidth = 20;
ctx.strokeRect(10, 10, 2028, 2028);

// Draw a border around the center 1024x1024 area (GREEN)
ctx.strokeStyle = '#00ff00';
ctx.lineWidth = 10;
ctx.strokeRect(512, 512, 1024, 1024);

// Add some text
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 60px Arial';
ctx.textAlign = 'center';
ctx.strokeStyle = '#000000';
ctx.lineWidth = 3;

ctx.strokeText('2048x2048 Texture', 1024, 300);
ctx.fillText('2048x2048 Texture', 1024, 300);

ctx.strokeText('Center 1024x1024', 1024, 1024);
ctx.fillText('Center 1024x1024', 1024, 1024);

ctx.strokeText('should be visible', 1024, 1100);
ctx.fillText('should be visible', 1024, 1100);

// Add corner labels
ctx.font = 'bold 40px Arial';
ctx.lineWidth = 2;

ctx.strokeText('Top Left', 200, 100);
ctx.fillText('Top Left', 200, 100);

ctx.strokeText('Top Right', 1848, 100);
ctx.fillText('Top Right', 1848, 100);

ctx.strokeText('Bottom Left', 200, 1980);
ctx.fillText('Bottom Left', 200, 1980);

ctx.strokeText('Bottom Right', 1848, 1980);
ctx.fillText('Bottom Right', 1848, 1980);

// Save the image
const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
const publicDir = path.join(__dirname, '..', 'public');
const outputPath = path.join(publicDir, 'sample-texture.jpg');

fs.writeFileSync(outputPath, buffer);
console.log(`Texture generated at: ${outputPath}`);
