import React, { useState } from 'react';
import { getBestEscapes } from '../game/difficulty';
import { audio } from '../game/audio';
import {
  getControlMode, setControlMode,
  getHapticsEnabled, setHapticsEnabled,
  resetAllProgress,
  type ControlMode,
} from '../game/prefs';

export const APP_VERSION = 'v0.1';

interface Props {
  hasActiveRun: boolean;
  onStart:    () => void;
  onContinue: () => void;
}

export default function MainMenu({ hasActiveRun, onStart, onContinue }: Props) {
  const [showSettings, setShowSettings]   = useState(false);
  const [muted,        setMuted]          = useState(audio.muted);
  const [ctrlMode,     setCtrlMode]       = useState<ControlMode>(getControlMode);
  const [hapticsOn,    setHapticsOn]      = useState(getHapticsEnabled);
  const [confirmReset, setConfirmReset]   = useState(false);
  const best = getBestEscapes();

  const handleStart = () => { audio.init(); onStart(); };
  const handleContinue = () => { audio.init(); onContinue(); };

  const toggleMute = () => {
    const m = audio.toggleMute();
    setMuted(m);
  };

  const switchControl = (m: ControlMode) => {
    setCtrlMode(m);
    setControlMode(m);
  };

  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
  };

  const doReset = () => {
    resetAllProgress();
    window.location.reload();
  };

  return (
    <div style={S.root}>
      <div style={S.glow} />

      <div style={S.card}>
        <div style={S.glyph}>◈</div>
        <h1 style={S.title}>MAZE</h1>
        <p style={S.sub}>The maze remembers your steps.</p>

        {best > 0 && (
          <div style={S.bestBadge}>Best run: {best} escape{best !== 1 ? 's' : ''}</div>
        )}

        <div style={S.btnGroup}>
          <button style={S.btnPrimary} onClick={handleStart}>
            {hasActiveRun ? 'NEW RUN' : 'START RUN'}
          </button>

          {hasActiveRun && (
            <button style={S.btnContinue} onClick={handleContinue}>
              CONTINUE RUN
            </button>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.footerBtn} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button style={S.footerBtn} onClick={() => setShowSettings(true)} title="Settings">
            ⚙
          </button>
        </div>

        <div style={S.version}>{APP_VERSION}</div>
      </div>

      {/* ── Settings overlay ── */}
      {showSettings && (
        <div style={S.overlay}>
          <div style={S.panel}>
            <div style={S.panelTitle}>SETTINGS</div>

            <div style={S.row}>
              <span style={S.rowLabel}>Controls</span>
              <div style={S.toggleGroup}>
                <button style={{...S.toggleBtn,...(ctrlMode==='swipe'?S.active:{})}}
                        onClick={() => switchControl('swipe')}>Swipe</button>
                <button style={{...S.toggleBtn,...(ctrlMode==='dpad'?S.active:{})}}
                        onClick={() => switchControl('dpad')}>D-pad</button>
              </div>
            </div>

            <div style={S.row}>
              <span style={S.rowLabel}>Sound</span>
              <button style={{...S.toggleBtn,...(!muted?S.active:{})}}
                      onClick={toggleMute}>{muted ? 'Off' : 'On'}</button>
            </div>

            <div style={S.row}>
              <span style={S.rowLabel}>Haptics</span>
              <button style={{...S.toggleBtn,...(hapticsOn?S.active:{})}}
                      onClick={toggleHaptics}>{hapticsOn ? 'On' : 'Off'}</button>
            </div>

            <div style={S.divider} />

            {!confirmReset ? (
              <button style={{...S.btnGhost,color:'rgba(255,80,40,0.5)',borderColor:'rgba(255,80,40,0.2)'}}
                      onClick={() => setConfirmReset(true)}>
                ⚠ Reset Progress
              </button>
            ) : (
              <div style={S.resetBox}>
                <div style={S.resetMsg}>Clear all scores and preferences?</div>
                <div style={{display:'flex',gap:8}}>
                  <button style={{...S.btnGhost,flex:1,color:'rgba(255,80,40,0.7)',borderColor:'rgba(255,80,40,0.35)'}}
                          onClick={doReset}>Yes, reset</button>
                  <button style={{...S.toggleBtn,...S.active,flex:1}}
                          onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              </div>
            )}

            <button style={S.btnPrimary} onClick={() => { setShowSettings(false); setConfirmReset(false); }}>
              Done →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    background: '#070b0f',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'monospace', overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 480, height: 480, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(60,140,255,0.05) 0%, transparent 70%)',
    top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    pointerEvents: 'none',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    padding: '44px 44px 24px',
    background: 'rgba(10,18,30,0.97)',
    border: '1px solid rgba(90,180,255,0.1)',
    borderRadius: 20,
    boxShadow: '0 0 80px rgba(0,0,0,0.9)',
    maxWidth: 320, width: '88%', zIndex: 2,
  },
  glyph: {
    fontSize: 48, color: '#5ab4ff',
    filter: 'drop-shadow(0 0 18px rgba(90,180,255,0.65))',
    lineHeight: 1,
  },
  title: {
    fontSize: 36, fontWeight: 900, letterSpacing: '0.36em',
    color: '#5ab4ff', margin: 0,
    textShadow: '0 0 22px rgba(90,180,255,0.38)',
  },
  sub: {
    fontSize: 12, color: 'rgba(255,255,255,0.32)',
    letterSpacing: '0.06em', margin: 0, textAlign: 'center', lineHeight: 1.7,
  },
  bestBadge: {
    fontSize: 11, color: 'rgba(255,208,60,0.55)',
    fontFamily: 'monospace', letterSpacing: '0.08em',
    background: 'rgba(255,208,60,0.06)',
    border: '1px solid rgba(255,208,60,0.15)',
    borderRadius: 6, padding: '4px 10px',
  },
  btnGroup: {
    display: 'flex', flexDirection: 'column', gap: 8, width: '100%',
  },
  btnPrimary: {
    padding: '14px 0',
    background: 'rgba(90,180,255,0.1)',
    border: '1px solid rgba(90,180,255,0.4)',
    borderRadius: 10, color: '#5ab4ff',
    fontSize: 15, fontWeight: 700, letterSpacing: '0.18em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnContinue: {
    padding: '14px 0',
    background: 'rgba(0,200,120,0.07)',
    border: '1px solid rgba(0,200,120,0.32)',
    borderRadius: 10, color: '#00d882',
    fontSize: 15, fontWeight: 700, letterSpacing: '0.18em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnGhost: {
    padding: '10px 0', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: 'rgba(255,255,255,0.35)',
    fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  footer: {
    display: 'flex', gap: 16, justifyContent: 'center', marginTop: -4,
  },
  footerBtn: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.25)',
    fontSize: 20, cursor: 'pointer', padding: '4px 8px',
  },
  version: {
    fontSize: 9, color: 'rgba(255,255,255,0.12)',
    fontFamily: 'monospace', letterSpacing: '0.1em', marginTop: -6,
  },
  // Settings overlay
  overlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(7,11,15,0.92)',
    backdropFilter: 'blur(10px)', zIndex: 10,
  },
  panel: {
    display: 'flex', flexDirection: 'column', gap: 12,
    padding: '28px 28px 24px',
    background: 'rgba(10,18,30,0.98)',
    border: '1px solid rgba(90,180,255,0.1)',
    borderRadius: 18, maxWidth: 320, width: '90%',
  },
  panelTitle: {
    fontSize: 14, fontWeight: 800, letterSpacing: '0.26em',
    color: '#5ab4ff', fontFamily: 'monospace', textAlign: 'center',
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 9,
  },
  rowLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace',
  },
  toggleGroup: { display: 'flex', gap: 6 },
  toggleBtn: {
    padding: '5px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: 'rgba(255,255,255,0.3)',
    fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
  },
  active: {
    background: 'rgba(90,180,255,0.14)',
    border: '1px solid rgba(90,180,255,0.42)',
    color: '#5ab4ff',
  },
  divider: {
    borderTop: '1px solid rgba(255,255,255,0.05)',
    margin: '2px 0',
  },
  resetBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    background: 'rgba(255,50,20,0.05)',
    border: '1px solid rgba(255,50,20,0.12)',
    borderRadius: 8, padding: '10px',
  },
  resetMsg: {
    fontSize: 11, color: 'rgba(255,140,100,0.65)',
    fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.6,
  },
};
