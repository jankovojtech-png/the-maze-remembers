import React from 'react';
import type { ObjectiveType } from '../game/types';

interface Props {
  level: number;
  objective: ObjectiveType;
  keyCount: number;
  onEnter: () => void;
  onMenu: () => void;
}

const OBJ_INFO: Record<ObjectiveType, { icon: string; label: string; color: string }> = {
  'exit':          { icon: '◉', label: 'Find the exit',          color: '#00ff88' },
  'keys':          { icon: '◆', label: 'Collect keys, then exit', color: '#ffd060' },
  'unstable-exit': { icon: '⚡', label: 'Find the moving exit',   color: '#80c0ff' },
};

const WARNINGS: Partial<Record<ObjectiveType, string>> = {
  'keys':          'The exit is locked until all keys are found.',
  'unstable-exit': 'The exit relocates after each maze shift.',
};

// Brief lore lines per objective type
const LORE: Record<ObjectiveType, string[]> = {
  'exit':          ['The maze is dark.', 'Follow the light.'],
  'keys':          ['Fragments of light have scattered.', 'Gather them before you can leave.'],
  'unstable-exit': ['The exit has a mind of its own.', 'It will not wait for you.'],
};

export default function LevelIntro({ level, objective, keyCount, onEnter, onMenu }: Props) {
  const info    = OBJ_INFO[objective];
  const warning = WARNINGS[objective];
  const lore    = LORE[objective];

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        <div style={S.levelBadge}>LEVEL {level}</div>

        <div style={{ ...S.icon, color: info.color, filter: `drop-shadow(0 0 14px ${info.color})` }}>
          {info.icon}
        </div>

        <div style={{ ...S.label, color: info.color }}>{info.label}</div>

        {keyCount > 0 && (
          <div style={S.keysHint}>
            {Array.from({ length: keyCount }, (_, i) => (
              <span key={i} style={{ color: '#ffd060', fontSize: 18, margin: '0 2px' }}>◆</span>
            ))}
            <span style={S.keysText}> × {keyCount}</span>
          </div>
        )}

        <div style={S.loreBox}>
          {lore.map(line => <p key={line} style={S.loreLine}>{line}</p>)}
        </div>

        {warning && (
          <div style={S.warn}>⚠ {warning}</div>
        )}

        <button style={S.btnEnter} onClick={onEnter}>
          ENTER MAZE →
        </button>
        <button style={S.btnMenu} onClick={onMenu}>
          ← Menu
        </button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(7,11,15,0.90)',
    backdropFilter: 'blur(10px)',
    zIndex: 25,
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '32px 36px 26px',
    background: 'rgba(10,18,32,0.98)',
    border: '1px solid rgba(90,180,255,0.12)',
    borderRadius: 20,
    boxShadow: '0 0 60px rgba(0,0,0,0.9)',
    maxWidth: 320, width: '88%',
  },
  levelBadge: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
    color: 'rgba(90,180,255,0.55)', fontFamily: 'monospace',
    background: 'rgba(90,180,255,0.08)',
    border: '1px solid rgba(90,180,255,0.18)',
    borderRadius: 6, padding: '4px 10px',
  },
  icon: {
    fontSize: 46, lineHeight: 1.1, marginTop: 4,
  },
  label: {
    fontSize: 18, fontWeight: 800, letterSpacing: '0.08em',
    fontFamily: 'monospace', textAlign: 'center',
  },
  keysHint: {
    display: 'flex', alignItems: 'center', gap: 2, marginTop: -2,
  },
  keysText: {
    fontSize: 14, color: 'rgba(255,208,60,0.6)',
    fontFamily: 'monospace', marginLeft: 4,
  },
  loreBox: {
    textAlign: 'center', margin: '2px 0',
  },
  loreLine: {
    fontSize: 12, color: 'rgba(255,255,255,0.3)',
    fontFamily: 'monospace', lineHeight: 1.8,
    fontStyle: 'italic', margin: 0,
  },
  warn: {
    fontSize: 11, color: '#ff8040',
    fontFamily: 'monospace', letterSpacing: '0.06em',
    textAlign: 'center', lineHeight: 1.5,
    background: 'rgba(255,100,30,0.08)',
    border: '1px solid rgba(255,100,30,0.2)',
    borderRadius: 6, padding: '6px 12px', width: '100%',
  },
  btnEnter: {
    marginTop: 6, padding: '14px 0',
    background: 'rgba(90,180,255,0.1)',
    border: '1px solid rgba(90,180,255,0.4)',
    borderRadius: 10, color: '#5ab4ff',
    fontSize: 15, fontWeight: 700, letterSpacing: '0.16em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnMenu: {
    padding: '9px 0',
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.22)',
    fontSize: 11, fontFamily: 'monospace',
    cursor: 'pointer', letterSpacing: '0.08em',
  },
};
