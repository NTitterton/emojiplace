const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const WebSocket = require('ws');
const { RedisService } = require('./services/redis');
const { UserService } = require('./services/user');
const { CanvasService } = require('./services/canvas');
const pixelRoutes = require('./routes/pixels');
const userRoutes = require('./routes/users');

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize services
const redisService = new RedisService();
const userService = new UserService(redisService);
const canvasService = new CanvasService(redisService);

// Add services to req object
app.use((req, res, next) => {
  req.services = { redisService, userService, canvasService };
  next();
});

// Routes
app.use('/api/pixels', pixelRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket setup
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(`WebSocket connection from ${clientIp}`);
  
  ws.clientIp = clientIp;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data, { userService, canvasService });
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket disconnected: ${clientIp}`);
  });
});

async function handleWebSocketMessage(ws, data, services) {
  const { type, payload } = data;
  
  switch (type) {
    case 'place_pixel':
      await handlePixelPlacement(ws, payload, services);
      break;
    case 'subscribe_region':
      // Subscribe to updates for a specific region
      ws.region = payload.region;
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

async function handlePixelPlacement(ws, payload, { userService, canvasService }) {
  try {
    const { x, y, emoji, username } = payload;
    const clientIp = ws.clientIp;
    
    // Check cooldown
    const canPlace = await userService.canPlacePixel(clientIp);
    if (!canPlace) {
      const cooldownEnd = await userService.getCooldownEnd(clientIp);
      ws.send(JSON.stringify({
        type: 'place_error',
        message: 'Cooldown active',
        cooldownEnd
      }));
      return;
    }
    
    // Place pixel
    const pixelData = await canvasService.placePixel(x, y, emoji, clientIp, username);
    await userService.setPixelCooldown(clientIp);
    
    // Broadcast to all connected clients
    const broadcastData = JSON.stringify({
      type: 'pixel_placed',
      data: { x, y, emoji, placedBy: username || clientIp, timestamp: pixelData.timestamp }
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(broadcastData);
      }
    });
    
    ws.send(JSON.stringify({ type: 'place_success', data: pixelData }));
  } catch (error) {
    console.error('Pixel placement error:', error);
    ws.send(JSON.stringify({ type: 'place_error', message: 'Failed to place pixel' }));
  }
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; 