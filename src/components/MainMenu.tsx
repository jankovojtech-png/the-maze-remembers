import React, { useState } from 'react';
import { getBestEscapes } from '../game/difficulty';
import { resetAllProgress } from '../game/prefs';

export const APP_VERSION = 'v0.2';

interface Props {
  hasActiveRun: boolean;
  onStart:    () => void;
  onContinue: () => void;
}

export default function MainMenu({ hasActiveRun, onStart, onContinue }: Props) {
  const [confirm, setConfirm] = useState(false);
  const best = getBestEscapes();

  const doReset = () => { resetAllProgress(); window.location.reload(); };

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.glyph}>◈</div>
        <h1 style={S.title}>MAZE</h1>
        <p style={S.sub}>Find the exit before the maze changes.</p>

        {best > 0 && (
          <p style={S.best}>Best run: {best} escape{best !== 1 ? 's' : ''}</p>
        )}

        <div style={S.btnGroup}>
          <button style={S.btnPrimary} onClick={onStart}>
            {hasActiveRun ? 'New Run' : 'Start'}
          </button>

          {hasActiveRun && (
            <button style={S.btnSecondary} onClick={onContinue}>
              Continue
            </button>
          )}

          {!confirm ? (
            <button style={S.btnGhost} onClick={() => setConfirm(true)}>
              Reset
            </button>
          ) : (
            <div style={S.confirmBox}>
              <span style={S.confirmText}>Reset all progress?</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...S.btnGhost, flex: 1, color: 'rgba(255,80,40,0.65)' }}
                        onClick={doReset}>Yes</button>
                <button style={{ ...S.btnGhost, flex: 1 }}
                        onClick={() => setConfirm(false)}>No</button>
              </div>
            </div>
          )}
        </div>

        <p style={S.version}>{APP_VERSION}</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'monospace',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: '44px 44px 24px',
    background: 'rgba(6,10,18,0.98)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 18,
    maxWidth: 280, width: '86%',
  },
  glyph: {
    fontSize: 40, color: 'rgba(90,180,255,0.7)',
    filter: 'drop-shadow(0 0 14px rgba(90,180,255,0.4))',
    lineHeight: 1,
  },
  title: {
    fontSize: 32, fontWeight: 900, letterSpacing: '0.4em',
    color: 'rgba(255,255,255,0.85)', margin: 0,
  },
  sub: {
    fontSize: 11, color: 'rgba(255,255,255,0.28)',
    letterSpacing: '0.04em', margin: 0,
    textAlign: 'center', lineHeight: 1.7, maxWidth: 200,
  },
  best: {
    fontSize: 11, color: 'rgba(255,208,60,0.45)',
    fontFamily: 'monospace', letterSpacing: '0.08em', margin: 0,
  },
  btnGroup: {
    display: 'flex', flexDirection: 'column', gap: 7, width: '100%', marginTop: 4,
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10, color: 'rgba(255,255,255,0.8)',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.16em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnSecondary: {
    padding: '13px 0',
    background: 'rgba(0,200,120,0.06)',
    border: '1px solid rgba(0,200,120,0.22)',
    borderRadius: 10, color: 'rgba(0,220,130,0.8)',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.16em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnGhost: {
    padding: '9px 0', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, color: 'rgba(255,255,255,0.25)',
    fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  confirmBox: {
    display: 'flex', flexDirection: 'column', gap: 7,
    border: '1px solid rgba(255,80,40,0.15)',
    borderRadius: 9, padding: '10px',
  },
  confirmText: {
    fontSize: 10, color: 'rgba(255,160,120,0.55)',
    textAlign: 'center', letterSpacing: '0.06em',
  },
  version: {
    fontSize: 9, color: 'rgba(255,255,255,0.1)',
    fontFamily: 'monospace', letterSpacing: '0.1em',
    margin: '4px 0 0',
  },
};
