import React from 'react';
import type { User } from 'firebase/auth';
import type { Profile } from '../account-api';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  profile: Profile | null;
  onLogout: () => void;
  busy: boolean;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  profile,
  onLogout,
  busy,
}) => {
  if (!isOpen || !user) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
      <div className="modal-dialog account-modal-dialog">
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
          <div className="account-avatar-large">
            {profile?.displayName?.[0] || user.displayName?.[0] || 'V'}
          </div>
          <h2 id="account-modal-title" className="modal-title">
            {profile?.displayName || user.displayName || 'Customer Account'}
          </h2>
          <p className="modal-subtitle">{profile?.email || user.email}</p>
        </div>

        <div className="account-details-list">
          <div className="account-detail-item">
            <span className="detail-label">Email Address</span>
            <span className="detail-value">{profile?.email || user.email}</span>
          </div>

          <div className="account-detail-item">
            <span className="detail-label">Account Status</span>
            <span className="detail-value status-badge-active">Verified Customer</span>
          </div>

          {profile?.createdAt && (
            <div className="account-detail-item">
              <span className="detail-label">Member Since</span>
              <span className="detail-value">
                {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}

          <div className="account-detail-item">
            <span className="detail-label">Marketing Updates</span>
            <span className="detail-value">
              {profile?.marketingConsent ? 'Subscribed' : 'Not subscribed (Essential updates only)'}
            </span>
          </div>
        </div>

        <div className="account-modal-actions">
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            onClick={onLogout}
            disabled={busy}
          >
            {busy ? 'Signing Out…' : 'Sign Out of V MOTIV'}
          </button>
        </div>
      </div>
    </div>
  );
};
