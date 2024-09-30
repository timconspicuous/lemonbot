import express from 'express';
import configManager from '../config/configManager.js';


const router = express.Router();

router.get('/api/config', (_req, res) => {
  try {
    const config = configManager.getAll();
    res.json(config);
  } catch (error) {
    console.error('Failed to read config:', error);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

router.get('/api/config/default', async (_req, res) => {
  try {
    const defaultConfig = await configManager.readDefaultConfig();
    res.json(defaultConfig);
  } catch (error) {
    console.error('Failed to read default config:', error);
    res.status(500).json({ error: 'Failed to read default config' });
  }
});

router.post('/api/config', async (req, res) => {
  try {
    const updatedConfig = await configManager.updateConfig(req.body);
    res.json({ message: 'Config updated successfully', config: updatedConfig });
  } catch (error) {
    console.error('Failed to update config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

router.post('/api/config/reset', async (_req, res) => {
  try {
    const defaultConfig = await configManager.resetConfig();
    res.json({ message: 'Config reset to default successfully', config: defaultConfig });
  } catch (error) {
    console.error('Failed to reset config:', error);
    res.status(500).json({ error: 'Failed to reset config' });
  }
});

export default router;