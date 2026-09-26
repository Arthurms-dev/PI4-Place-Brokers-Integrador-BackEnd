'use strict';

const { Router } = require('express');
const { login, register, me } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', authMiddleware, me);

module.exports = router;