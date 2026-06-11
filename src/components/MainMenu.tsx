import React, { useState } from 'react';
import { getHighestLevel } from '../game/levels';
import { audio } from '../game/audio';
import {
  getControlMode, setControlMode,
  getHapticsEnabled, setHapticsEnabled,
  resetAllProgress,
  type ControlMode,
} from '../game/prefs';

export const APP_VERSION = 'Prototype v0.1';

interface Props {
  onStart: (level: number) => void;
}

const HOW_TO = [
  ['◈', 'Move through the fog.', 'Arrow keys, WASD, swipe anywhere, or the on-screen D-pad.'],
  ['◆', 'Some levels need keys.', 'Step on glowing gold keys — the exit unlocks when all are collected.'],
  ['⚡', 'The exit may relocate.', 'On some levels, the exit moves after every maze shift.'],
  ['⚠', 'Maze shifts every few seconds.', 'Cells you walk on too often become unstable — they shift first.'],
  ['◑', 'Watch your candle.', 'The sanity bar drains over time. Reach the exit before it hits zero.'],
];

const FEEDBACK_TEMPLATE = `TESTER FEEDBACK — MAZE ${APP_VERSION}

1. What was confusing?
   → 

2. What was fun?
   → 

3. When did you want to stop?
   → 

Anything else? (controls, difficulty, UI, bugs)
   → 

--- Thank you for playtesting! ---`;

type Panel = 'none' | 'howto' | 'settings' | 'tester';

export default function MainMenu({ onStart }: Props) {
  const [panel,        setPanel]       = useState<Panel>('none');
  const [muted,        setMuted]       = useState(audio.muted);
  const [ctrlMode,     setCtrlMode]    = useState<ControlMode>(() => getControlMode());
  const [hapticsOn,    setHapticsOn]   = useState(() => getHapticsEnabled());
  const [confirmReset, setConfirmReset] = useState(false);
  const [shareLabel,   setShareLabel]  = useState('Share Game');
  const [copyLabel,    setCopyLabel]   = useState('Copy feedback template');
  const [highest,      setHighest]     = useState(() => getHighestLevel());

  const handleStart = (lvl: number) => {
    audio.init();
    onStart(lvl);
  };

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
    // Reload page for a truly fresh start
    window.location.reload();
  };

  const shareGame = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MAZE — Dark Labyrinth',
          text: 'Navigate the shifting dark maze. The maze remembers your steps.',
          url,
        });
        setShareLabel('Shared! ✓');
      } catch {
        // user dismissed share sheet — don't show error
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareLabel('URL Copied! ✓');
      } catch {
        setShareLabel('Copy URL manually');
      }
    }
    setTimeout(() => setShareLabel('Share Game'), 2500);
  };

  const copyFeedback = async () => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_TEMPLATE);
      setCopyLabel('Copied! ✓');
    } catch {
      setCopyLabel('Copy failed — try manually');
    }
    setTimeout(() => setCopyLabel('Copy feedback template'), 2500);
  };

  const closeSettings = () => {
    setPanel('none');
    setConfirmReset(false);
    // Re-read highest in case it changed
    setHighest(getHighestLevel());
  };

  return (
    <div style={S.root}>
      <div style={S.glow} />

      {/* ── Main card ── */}
      <div style={S.card}>
        <div style={S.glyph}>◈</div>
        <h1 style={S.title}>MAZE</h1>
        <p style={S.sub}>The maze remembers your steps.</p>

        <div style={S.btnGroup}>
          <button style={S.btnPrimary} onClick={() => handleStart(1)}>
            START  <span style={S.lvlBadge}>Lv 1</span>
          </button>

          {highest > 1 && (
            <button style={S.btnContinue} onClick={() => handleStart(highest)}>
              CONTINUE  <span style={S.lvlBadge}>Lv {highest}</span>
            </button>
          )}

          <div style={S.btnRow}>
            <button style={{...S.btnGhost,flex:1}} onClick={() => setPanel('howto')}>
              How to Play
            </button>
            <button style={{...S.btnGhost,flex:1,color:'rgba(90,180,255,0.5)',borderColor:'rgba(90,180,255,0.18)'}}
                    onClick={shareGame}>
              {shareLabel}
            </button>
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.footerBtn} onClick={toggleMute} title={muted?'Unmute':'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button style={S.footerBtn} onClick={() => setPanel('settings')} title="Settings">
            ⚙
          </button>
          <button style={S.footerBtn} onClick={() => setPanel('tester')} title="Tester Notes">
            📋
          </button>
        </div>

        <div style={S.version}>{APP_VERSION}</div>
      </div>

      {/* ── How to Play overlay ── */}
      {panel === 'howto' && (
        <div style={S.overlay}>
          <div style={S.panel}>
            <div style={S.panelTitle}>HOW TO PLAY</div>
            <div style={S.list}>
              {HOW_TO.map(([icon, title, desc]) => (
                <div key={title} style={S.row}>
                  <span style={S.rowIcon}>{icon}</span>
                  <div>
                    <div style={S.rowTitle}>{title}</div>
                    <div style={S.rowDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button style={S.btnPrimary} onClick={() => setPanel('none')}>
              Got it →
            </button>
          </div>
        </div>
      )}

      {/* ── Settings overlay ── */}
      {panel === 'settings' && (
        <div style={S.overlay}>
          <div style={S.panel}>
            <div style={S.panelTitle}>SETTINGS</div>

            <div style={S.settingRow}>
              <span style={S.settingLabel}>Controls</span>
              <div style={S.toggleGroup}>
                <button
                  style={{...S.toggleBtn,...(ctrlMode==='swipe'?S.toggleActive:{})}}
                  onClick={() => switchControl('swipe')}
                >Swipe</button>
                <button
                  style={{...S.toggleBtn,...(ctrlMode==='dpad'?S.toggleActive:{})}}
                  onClick={() => switchControl('dpad')}
                >D-pad</button>
              </div>
            </div>

            <div style={S.settingRow}>
              <span style={S.settingLabel}>Sound</span>
              <button
                style={{...S.toggleBtn,...(!muted?S.toggleActive:{})}}
                onClick={toggleMute}
              >{muted ? 'Off' : 'On'}</button>
            </div>

            <div style={S.settingRow}>
              <span style={S.settingLabel}>Haptics</span>
              <button
                style={{...S.toggleBtn,...(hapticsOn?S.toggleActive:{})}}
                onClick={toggleHaptics}
              >{hapticsOn ? 'On' : 'Off'}</button>
            </div>

            <div style={S.divider} />

            {!confirmReset ? (
              <button
                style={{...S.btnGhost,color:'rgba(255,80,40,0.5)',borderColor:'rgba(255,80,40,0.2)'}}
                onClick={() => setConfirmReset(true)}
              >
                ⚠ Reset All Progress
              </button>
            ) : (
              <div style={S.resetConfirm}>
                <div style={S.resetMsg}>
                  This clears your best times, unlocked levels, and preferences.
                </div>
                <div style={{display:'flex',gap:8,width:'100%'}}>
                  <button style={{...S.btnGhost,flex:1,color:'rgba(255,80,40,0.7)',borderColor:'rgba(255,80,40,0.35)'}} onClick={doReset}>
                    Yes, reset
                  </button>
                  <button style={{...S.toggleBtn,...S.toggleActive,flex:1}} onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button style={S.btnPrimary} onClick={closeSettings}>
              Done →
            </button>
          </div>
        </div>
      )}

      {/* ── Tester Notes overlay ── */}
      {panel === 'tester' && (
        <div style={S.overlay}>
          <div style={S.panel}>
            <div style={S.panelTitle}>TESTER NOTES</div>
            <div style={S.testerSub}>
              Thank you for playtesting!<br />
              Please answer these 3 questions after playing.
            </div>

            <div style={S.questionList}>
              {[
                ['1', 'What was confusing?'],
                ['2', 'What was fun?'],
                ['3', 'When did you want to stop?'],
              ].map(([num, q]) => (
                <div key={num} style={S.question}>
                  <span style={S.qNum}>{num}</span>
                  <span style={S.qText}>{q}</span>
                </div>
              ))}
            </div>

            <button style={S.btnCopyFeedback} onClick={copyFeedback}>
              {copyLabel}
            </button>

            <div style={S.testerNote}>
              The template will be copied to your clipboard — paste it in a message to the developer.
            </div>

            <button style={S.btnPrimary} onClick={() => setPanel('none')}>
              Close →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    background: '#070b0f',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'monospace', overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 500, height: 500, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(60,140,255,0.06) 0%, transparent 70%)',
    top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    pointerEvents: 'none',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: '40px 40px 24px',
    background: 'rgba(10,18,30,0.97)',
    border: '1px solid rgba(90,180,255,0.12)',
    borderRadius: 20,
    boxShadow: '0 0 80px rgba(0,0,0,0.9)',
    maxWidth: 340, width: '90%', zIndex: 2,
  },
  glyph: {
    fontSize: 44, color: '#5ab4ff',
    filter: 'drop-shadow(0 0 16px rgba(90,180,255,0.7))',
    lineHeight: 1, marginBottom: 2,
  },
  title: {
    fontSize: 34, fontWeight: 900, letterSpacing: '0.32em',
    color: '#5ab4ff', margin: 0,
    textShadow: '0 0 20px rgba(90,180,255,0.4)',
  },
  sub: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.06em', margin: 0, textAlign: 'center', lineHeight: 1.6,
  },
  btnGroup: {
    display: 'flex', flexDirection: 'column', gap: 7, width: '100%', marginTop: 6,
  },
  btnRow: {
    display: 'flex', gap: 7,
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'rgba(90,180,255,0.1)',
    border: '1px solid rgba(90,180,255,0.4)',
    borderRadius: 10, color: '#5ab4ff',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.16em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  btnContinue: {
    padding: '13px 0',
    background: 'rgba(0,200,120,0.08)',
    border: '1px solid rgba(0,200,120,0.35)',
    borderRadius: 10, color: '#00d882',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.16em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  btnGhost: {
    padding: '10px 0', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: 'rgba(255,255,255,0.38)',
    fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  lvlBadge: {
    fontSize: 11, fontWeight: 400, letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.45)',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 4, padding: '2px 6px',
  },
  footer: {
    marginTop: 2, display: 'flex', gap: 12, justifyContent: 'center',
  },
  footerBtn: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.28)',
    fontSize: 18, cursor: 'pointer', fontFamily: 'monospace',
    padding: '4px 8px',
  },
  version: {
    fontSize: 9, color: 'rgba(255,255,255,0.15)',
    fontFamily: 'monospace', letterSpacing: '0.12em',
    marginTop: -2,
  },
  // Panels (shared overlay structure)
  overlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(7,11,15,0.92)',
    backdropFilter: 'blur(8px)', zIndex: 10,
  },
  panel: {
    display: 'flex', flexDirection: 'column', gap: 12,
    padding: '28px 28px 24px',
    background: 'rgba(10,18,30,0.98)',
    border: '1px solid rgba(90,180,255,0.12)',
    borderRadius: 18, maxWidth: 360, width: '92%',
    maxHeight: '88vh', overflowY: 'auto',
  },
  panelTitle: {
    fontSize: 15, fontWeight: 800, letterSpacing: '0.24em',
    color: '#5ab4ff', fontFamily: 'monospace', textAlign: 'center',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  rowIcon: {
    fontSize: 18, minWidth: 26, color: '#5ab4ff', lineHeight: 1.3,
    filter: 'drop-shadow(0 0 6px rgba(90,180,255,0.5))',
  },
  rowTitle: {
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.72)',
    fontFamily: 'monospace', marginBottom: 2,
  },
  rowDesc: {
    fontSize: 11, color: 'rgba(255,255,255,0.32)',
    fontFamily: 'monospace', lineHeight: 1.55,
  },
  // Settings
  settingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 9,
  },
  settingLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
  },
  toggleGroup: { display: 'flex', gap: 6 },
  toggleBtn: {
    padding: '5px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: 'rgba(255,255,255,0.3)',
    fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
  },
  toggleActive: {
    background: 'rgba(90,180,255,0.15)',
    border: '1px solid rgba(90,180,255,0.45)',
    color: '#5ab4ff',
  },
  divider: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    margin: '2px 0',
  },
  resetConfirm: {
    display: 'flex', flexDirection: 'column', gap: 8,
    background: 'rgba(255,50,20,0.06)',
    border: '1px solid rgba(255,50,20,0.15)',
    borderRadius: 8, padding: '10px',
  },
  resetMsg: {
    fontSize: 11, color: 'rgba(255,150,100,0.7)',
    fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.6,
  },
  // Tester Notes
  testerSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.7,
  },
  questionList: {
    display: 'flex', flexDirection: 'column', gap: 8,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '12px 14px',
  },
  question: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
  },
  qNum: {
    fontSize: 11, color: '#5ab4ff', fontFamily: 'monospace',
    fontWeight: 700, minWidth: 16,
  },
  qText: {
    fontSize: 12, color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace', lineHeight: 1.55,
  },
  btnCopyFeedback: {
    padding: '12px 0',
    background: 'rgba(0,200,120,0.08)',
    border: '1px solid rgba(0,200,120,0.3)',
    borderRadius: 10, color: '#00d882',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  testerNote: {
    fontSize: 10, color: 'rgba(255,255,255,0.2)',
    fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.6,
  },
};
