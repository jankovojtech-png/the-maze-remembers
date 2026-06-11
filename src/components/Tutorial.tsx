import React, { useState } from 'react';

const STEPS = [
  { icon: '◈', title: 'Move through the fog.', sub: 'Arrow keys, WASD, swipe, or the D-pad.' },
  { icon: '◉', title: 'Find the glowing exit.', sub: 'A green glow marks your escape. Head toward it.' },
  { icon: '⚠', title: 'The maze shifts every few seconds.', sub: 'Walls move. Watch the countdown. Stay alert.' },
  { icon: '⬡', title: 'Repeated paths become unstable.', sub: 'Purple cracks form where you walk too often. The maze remembers.' },
  { icon: '◑', title: 'Do not let your light fade.', sub: 'Your candle dims over time. Reach the exit before darkness wins.' },
];

interface Props {
  onDone: () => void;
}

export default function Tutorial({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        {/* Step dots */}
        <div style={S.dots}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                ...S.dot,
                background: i === step ? '#5ab4ff' : i < step ? 'rgba(90,180,255,0.4)' : 'rgba(255,255,255,0.15)',
                transform: i === step ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <div style={S.icon}>{s.icon}</div>
        <div style={S.title}>{s.title}</div>
        <div style={S.sub}>{s.sub}</div>

        <div style={S.actions}>
          <button
            style={S.btnPrimary}
            onClick={() => isLast ? onDone() : setStep(step + 1)}
          >
            {isLast ? 'PLAY →' : 'Next →'}
          </button>
          {!isLast && (
            <button style={S.btnSkip} onClick={onDone}>
              Skip tutorial
            </button>
          )}
        </div>

        <div style={S.stepLabel}>{step + 1} / {STEPS.length}</div>
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
    zIndex: 30,
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: '36px 36px 28px',
    background: 'rgba(10,18,32,0.98)',
    border: '1px solid rgba(90,180,255,0.15)',
    borderRadius: 20,
    boxShadow: '0 0 60px rgba(0,0,0,0.9)',
    maxWidth: 340, width: '90%',
  },
  dots: {
    display: 'flex', gap: 7, marginBottom: 4,
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  icon: {
    fontSize: 52, color: '#5ab4ff',
    filter: 'drop-shadow(0 0 14px rgba(90,180,255,0.7))',
    lineHeight: 1.1, marginTop: 4,
  },
  title: {
    fontSize: 17, fontWeight: 800, letterSpacing: '0.06em',
    color: '#ffffff', fontFamily: 'monospace',
    textAlign: 'center', lineHeight: 1.4,
  },
  sub: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)',
    fontFamily: 'monospace', textAlign: 'center',
    lineHeight: 1.6, maxWidth: 260,
  },
  actions: {
    display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 6,
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'rgba(90,180,255,0.1)',
    border: '1px solid rgba(90,180,255,0.38)',
    borderRadius: 10, color: '#5ab4ff',
    fontSize: 15, fontWeight: 700, letterSpacing: '0.14em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnSkip: {
    padding: '9px 0',
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.22)',
    fontSize: 11, fontFamily: 'monospace',
    cursor: 'pointer', letterSpacing: '0.08em',
  },
  stepLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.18)',
    fontFamily: 'monospace', marginTop: -4,
  },
};
