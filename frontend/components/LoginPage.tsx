
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

// ─────────────────────────────────────────────────────────
// LoginPage — Tela de login Microsoft Entra ID
// ─────────────────────────────────────────────────────────
const LoginPage: React.FC = () => {
  const { login, isAuthenticating } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/30 p-8 sm:p-10">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25 mb-5">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              CRM Antigravity
            </h1>
            <p className="text-sm text-blue-200/60 mt-2">
              Plataforma de Gestão de Crédito Estruturado
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

          {/* Login info */}
          <div className="text-center mb-6">
            <p className="text-sm text-blue-100/70">
              Faça login com sua conta Microsoft corporativa para acessar o sistema.
            </p>
          </div>

          {/* Login Button */}
          <button
            id="login-microsoft-btn"
            onClick={login}
            disabled={isAuthenticating}
            className={`w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold text-sm
              transition-all duration-300 shadow-lg
              ${isAuthenticating
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed shadow-none'
                : 'bg-white text-gray-800 hover:bg-blue-50 hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0'
              }`}
          >
            {isAuthenticating ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                {/* Microsoft Logo */}
                <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                <span>Entrar com Microsoft</span>
              </>
            )}
          </button>

          {/* Footer note */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-[11px] text-blue-200/30">
              Protegido por Microsoft Entra ID · SSO Corporativo
            </p>

            {/* Escape hatch: go back to Mock mode — only visible in dev */}
            {import.meta.env.DEV && (
              <button
                id="login-back-to-mock"
                onClick={() => {
                  localStorage.setItem('entra_id_enabled', 'false');
                  window.location.reload();
                }}
                className="text-[11px] text-blue-300/40 hover:text-blue-300/70 underline underline-offset-2 transition-colors"
              >
                Voltar ao modo de desenvolvimento (Mock)
              </button>
            )}
          </div>
        </div>

        {/* Subtle bottom glow */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-blue-500/20 blur-2xl rounded-full" />
      </div>
    </div>
  );
};

export default LoginPage;
