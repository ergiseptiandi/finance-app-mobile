#!/usr/bin/env node
// Generate a simple notification sound WAV file for Finance Go
// This creates a short, pleasant "ding" sound

const fs = require('fs');
const path = require('path');

// WAV file parameters
const sampleRate = 44100;
const duration = 0.3; // 300ms
const frequency = 880; // A5 note - pleasant notification tone
const numSamples = Math.floor(sampleRate * duration);

// Generate samples with envelope (fade in/out)
const samples = [];
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const envelope = Math.sin(Math.PI * t / duration); // Smooth envelope
  const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.5;
  samples.push(sample);
}

// Create WAV file
const numChannels = 1;
const bitsPerSample = 16;
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);
const dataSize = numSamples * blockAlign;
const fileSize = 44 + dataSize;

const buffer = Buffer.alloc(fileSize);
let offset = 0;

// RIFF header
buffer.write('RIFF', offset); offset += 4;
buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
buffer.write('WAVE', offset); offset += 4;

// fmt chunk
buffer.write('fmt ', offset); offset += 4;
buffer.writeUInt32LE(16, offset); offset += 4; // chunk size
buffer.writeUInt16LE(1, offset); offset += 2; // PCM format
buffer.writeUInt16LE(numChannels, offset); offset += 2;
buffer.writeUInt32LE(sampleRate, offset); offset += 4;
buffer.writeUInt32LE(byteRate, offset); offset += 4;
buffer.writeUInt16LE(blockAlign, offset); offset += 2;
buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

// data chunk
buffer.write('data', offset); offset += 4;
buffer.writeUInt32LE(dataSize, offset); offset += 4;

// Write samples
for (const sample of samples) {
  const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
  buffer.writeInt16LE(intSample, offset);
  offset += 2;
}

// Write files
const projectRoot = path.join(__dirname, '..');
const androidPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw', 'finance_go_notification.wav');
const assetsPath = path.join(projectRoot, 'assets', 'sounds', 'finance_go_notification.wav');

// Create directories
fs.mkdirSync(path.join(androidPath, '..'), { recursive: true });
fs.mkdirSync(path.join(assetsPath, '..'), { recursive: true });

fs.writeFileSync(androidPath, buffer);
fs.writeFileSync(assetsPath, buffer);

console.log('Notification sound created:');
console.log('  Android:', androidPath);
console.log('  Assets:', assetsPath);
console.log('Duration:', duration * 1000, 'ms');
console.log('Frequency:', frequency, 'Hz');
