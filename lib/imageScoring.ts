import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import jpeg from "jpeg-js";

const THUMB_SIZE = 16; // small enough that decoding never holds more than 256 pixels in memory

export type ImageAnalysis = {
  hash: string; // 64-bit average-hash, hex encoded
  meanLuminance: number; // 0-255
  contrast: number; // std-dev of luminance, 0-255ish
  interestScore: number; // higher = more interesting
};

// Reject thresholds for "interesting" filtering.
const DARK_THRESHOLD = 32;
const BRIGHT_THRESHOLD = 235;
const MIN_CONTRAST = 10;

export function isInteresting(a: ImageAnalysis): boolean {
  if (a.meanLuminance < DARK_THRESHOLD || a.meanLuminance > BRIGHT_THRESHOLD) return false;
  if (a.contrast < MIN_CONTRAST) return false;
  return true;
}

/** Downsamples an image to a tiny thumbnail and computes brightness/contrast/hash from it.
 *  Only ever holds THUMB_SIZE x THUMB_SIZE pixels in memory, never the source image. */
export async function analyzeImage(uri: string): Promise<ImageAnalysis> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: THUMB_SIZE, height: THUMB_SIZE } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  let base64 = manipulated.base64;
  if (!base64) {
    base64 = await FileSystem.readAsStringAsync(manipulated.uri, { encoding: FileSystem.EncodingType.Base64 });
  }

  const buffer = base64ToUint8Array(base64);
  const decoded = jpeg.decode(buffer, { useTArray: true });

  const width = decoded.width;
  const height = decoded.height;
  const pixelCount = width * height;
  const luminances = new Float64Array(pixelCount);

  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4; // RGBA
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    luminances[i] = lum;
    sum += lum;
  }
  const meanLuminance = sum / pixelCount;

  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const d = luminances[i] - meanLuminance;
    varianceSum += d * d;
  }
  const contrast = Math.sqrt(varianceSum / pixelCount);

  const hash = averageHash(luminances, meanLuminance);

  // Higher contrast is more interesting; penalize being far from mid-brightness (128).
  const interestScore = contrast - Math.abs(meanLuminance - 128) * 0.15;

  return { hash, meanLuminance, contrast, interestScore };
}

function averageHash(luminances: Float64Array, mean: number): string {
  let hi = 0;
  let lo = 0;
  const n = luminances.length; // expected THUMB_SIZE*THUMB_SIZE = 256, but tolerate other sizes
  for (let i = 0; i < 64; i++) {
    const sampleIndex = Math.floor((i / 64) * n);
    const bit = luminances[sampleIndex] > mean ? 1 : 0;
    if (i < 32) {
      hi = (hi << 1) | bit;
    } else {
      lo = (lo << 1) | bit;
    }
  }
  const hiUnsigned = hi >>> 0;
  const loUnsigned = lo >>> 0;
  return hiUnsigned.toString(16).padStart(8, "0") + loUnsigned.toString(16).padStart(8, "0");
}

export function hammingDistance(hashA: string, hashB: string): number {
  const aHi = parseInt(hashA.slice(0, 8), 16) >>> 0;
  const aLo = parseInt(hashA.slice(8, 16), 16) >>> 0;
  const bHi = parseInt(hashB.slice(0, 8), 16) >>> 0;
  const bLo = parseInt(hashB.slice(8, 16), 16) >>> 0;
  return popcount32(aHi ^ bHi) + popcount32(aLo ^ bLo);
}

function popcount32(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = globalThis.atob ? globalThis.atob(base64) : base64Decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(base64: string): string {
  let result = "";
  let buffer = 0;
  let bits = 0;
  const clean = base64.replace(/=+$/, "");
  for (let i = 0; i < clean.length; i++) {
    const value = BASE64_CHARS.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return result;
}
