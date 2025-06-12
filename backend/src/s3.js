const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CHUNK_SIZE } = require('./constants');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.S3_CHUNK_BUCKET;

/**
 * Generates the S3 key for a chunk based on its top-left coordinate.
 * @param {number} x The x-coordinate of the top-left pixel of the chunk.
 * @param {number} y The y-coordinate of the top-left pixel of the chunk.
 * @returns {string} The S3 key for the chunk.
 */
function getChunkKey(x, y) {
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `chunks/v1/${chunkX}_${chunkY}.json`;
}

/**
 * Fetches a specific chunk from S3.
 * @param {string} key The S3 key for the chunk.
 * @returns {Promise<object | null>} The parsed chunk data, or null if not found.
 */
async function getChunk(key) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    const { Body } = await s3Client.send(command);
    const stream = Body.transformToString();
    const data = await stream;
    return JSON.parse(data);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return null; // Chunk doesn't exist yet
    }
    throw error;
  }
}

/**
 * Updates a chunk in S3 with new pixel data.
 * @param {number} x The x-coordinate of the pixel.
 * @param {number} y The y-coordinate of the pixel.
 * @param {object} pixelData The data for the pixel to update.
 */
async function updateChunk(x, y, pixelData) {
  const key = getChunkKey(x, y);
  let chunk = (await getChunk(key)) || {};

  // Update the pixel within the chunk
  const pixelKey = `${x},${y}`;
  chunk[pixelKey] = pixelData;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(chunk),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
}

module.exports = {
  getChunkKey,
  getChunk,
  updateChunk,
}; 