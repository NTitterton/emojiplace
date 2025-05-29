const express = require('express');
const router = express.Router();

// Get pixel at specific coordinates
router.get('/:x/:y', async (req, res) => {
  try {
    const { x, y } = req.params;
    const pixel = await req.services.canvasService.getPixel(parseInt(x), parseInt(y));
    
    res.json({ pixel });
  } catch (error) {
    console.error('Get pixel error:', error);
    res.status(500).json({ error: 'Failed to get pixel' });
  }
});

// Get region of pixels
router.get('/region/:x/:y/:width/:height', async (req, res) => {
  try {
    const { x, y, width, height } = req.params;
    const pixels = await req.services.canvasService.getRegion(
      parseInt(x),
      parseInt(y),
      parseInt(width),
      parseInt(height)
    );
    
    res.json({ pixels });
  } catch (error) {
    console.error('Get region error:', error);
    res.status(500).json({ error: 'Failed to get region' });
  }
});

module.exports = router; 