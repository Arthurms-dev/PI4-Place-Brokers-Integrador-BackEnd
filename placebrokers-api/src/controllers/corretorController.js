'use strict';

class CorretorController {
  /** @param {{ corretorRepository: import('../repositories/corretorRepository').CorretorRepository }} deps */
  constructor({ corretorRepository }) {
    this.corretorRepository = corretorRepository;
  }

  listar = async (req, res) => {
    try {
      const corretores = await this.corretorRepository.listar();
      return res.status(200).json({ corretores });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno no servidor.' },
      });
    }
  };
}

module.exports = { CorretorController };