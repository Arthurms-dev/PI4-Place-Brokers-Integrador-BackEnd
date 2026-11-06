'use strict';

class SegurancaService {
    /** @param {{ segurancaRepository, painelAdmRepository}} deps */
    constructor ({ segurancaRepository, painelAdmRepository}){
        this.segurancaRepository = segurancaRepository;
        this.painelAdmRepository = painelAdmRepository;
    }

/** Cria o aviso, a menos que a mesma `chave` já tenha gerado um dentro da janela. */
    async avisarUmaVez ({ chave, titulo, descricao, severidade = 'info', janelaMin = 60}){
        try { 
            if ( await this.segurancaRepository.existeAvisoRecente(chave, janelaMin)) return false;
            await this.painelAdmRepository.criarAviso({titulo, descricao, severidade, chave});
            return true;
        } catch (err) {
            console.error('Erro ao registrar aviso de segurança:', err);
            return false;
        }
    }

    /**
   * Registra um evento, conta quantos já houve na janela e, ao atingir o limite,
   * cria o aviso montado por `montarAviso({ total, detalhes })`.
   */
  async registrarEAvaliar({tipo, chave, detalhe = null , limite, janelaMin, montarAviso}){
    try {
        await this.segurancaRepository.registrarEvento ({ tipo, chave, detalhe});
        const total = await this.segurancaRepository.contarEventos({ tipo, chave, janelaMin});
        if ( total < limite ) return false;

        const detalhes = await this.segurancaRepository.detalhesRecentes({ tipo, chave, janelaMin });
      const aviso = montarAviso({ total, detalhes });
      return await this.avisarUmaVez({ chave: `${tipo}:${chave}`, janelaMin, ...aviso });
    } catch (err) {
      console.error('Erro ao avaliar evento de segurança:', err);
      return false;
    }
  }
}
module.exports = { SegurancaService};
