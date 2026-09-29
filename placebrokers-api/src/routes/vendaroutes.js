'use strict';

const { Router } = require('express');
const { criar, listar, decidir, vgv } = require('../controllers/vendacontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = Router();

router.use(authMiddleware);

router.post('/', criar);
router.get('/', listar);
router.patch('/:id', decidir);
router.get('/vgv', vgv);

module.exports = router;