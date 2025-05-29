const express = require('express');
const router = express.Router();

// Get user info
router.get('/me', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const user = await req.services.userService.getUser(clientIp);
    const canPlace = await req.services.userService.canPlacePixel(clientIp);
    const cooldownEnd = await req.services.userService.getCooldownEnd(clientIp);
    
    res.json({ 
      user,
      canPlace,
      cooldownEnd
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Set username
router.post('/username', async (req, res) => {
  try {
    const { username } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    if (!username || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 1-20 characters' });
    }
    
    await req.services.userService.setUsername(clientIp, username);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Set username error:', error);
    res.status(500).json({ error: 'Failed to set username' });
  }
});

module.exports = router; 