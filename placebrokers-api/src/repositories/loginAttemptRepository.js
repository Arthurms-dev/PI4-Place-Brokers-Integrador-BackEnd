'use strict';

const { supabaseAdmin } = require('../config/supabase');
const { JANELA_MINUTOS } = require('../utils/loginAttemptConfig');

class LoginAttemptRepository {
    async registrarFalha(email) {
        const { error } = await supabaseAdmin
            .from('tentativas_login_falhas')
            .insert({ email });

        if (error) throw error;
    }

    /** Quantas falhas esse e-mail teve nos últimos 15 minutos. */
    async contarFalhasRecentes(email) {
        const desde = new Date(
            Date.now() - JANELA_MINUTOS * 60 * 1000
        ).toISOString();

        const { count, error } = await supabaseAdmin
            .from('tentativas_login_falhas')
            .select('id', { count: 'exact', head: true })
            .eq('email', email)
            .gte('criado_em', desde);

        if (error) throw error;
        return count ?? 0;
    }
}

// `loginAttemptRepository` (minúsculo) mantido por compatibilidade com quem já importava assim.
module.exports = { LoginAttemptRepository, loginAttemptRepository: LoginAttemptRepository, JANELA_MINUTOS };