import React from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  busy: boolean;
  error: string;
  actionReason?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  busy,
  error,
  actionReason,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="modal-dialog auth-modal-dialog">
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close modal"
          onClick={onClose}
          disabled={busy}
        >
          ✕
        </button>

        <div className="modal-header">
          <div className="modal-icon-badge">🔒</div>
          <h2 id="auth-modal-title" className="modal-title">
            Sign In with Google
          </h2>
          <p className="modal-subtitle">
            {actionReason ||
              'Sign in to schedule test drives, submit purchase enquiries, or request an evaluation for your car.'}
          </p>
        </div>

        <div className="auth-modal-body">
          {error && (
            <div className="alert-box alert-error" role="alert">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-google-full"
            onClick={onLogin}
            disabled={busy}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"
              />
            </svg>
            <span>{busy ? 'Connecting to Google…' : 'Continue with Google'}</span>
          </button>

          <p className="auth-privacy-note">
            By continuing, you connect your account securely. We never post on your behalf or share
            your information with external telemarketers.
          </p>
        </div>
      </div>
    </div>
  );
};
