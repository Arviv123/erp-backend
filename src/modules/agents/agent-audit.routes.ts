/**
 * Agent Audit Routes
 * Runs completeness / quality checks across all ERP modules.
 * GET  /api/agents/audit          — run full audit
 * GET  /api/agents/audit/:category — run single category
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { runFullAudit, runCategoryAudit } from './agent-audit.service';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate as any);

// Full audit
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).user.tenantId as string;
    const report = await runFullAudit(tenantId);
    res.json({ success: true, data: report });
  } catch (err: any) {
    logger.error('Audit error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single category
router.get('/:category', async (req, res) => {
  try {
    const tenantId = (req as any).user.tenantId as string;
    const result = await runCategoryAudit(tenantId, req.params.category);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
