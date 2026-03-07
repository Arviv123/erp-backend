/**
 * Software Audit Routes — בדיקת שלמות תוכנה
 * GET  /api/agents/software-audit           — run full software audit
 * GET  /api/agents/software-audit/:module   — run single module audit
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { runSoftwareAudit, runSingleModuleAudit } from './agent-software-audit.service';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate as any);

// Full software audit
router.get('/', async (req, res) => {
  try {
    const report = await runSoftwareAudit();
    res.json({ success: true, data: report });
  } catch (err: any) {
    logger.error('Software audit error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single module audit
router.get('/:module', async (req, res) => {
  try {
    const result = await runSingleModuleAudit(req.params.module);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
