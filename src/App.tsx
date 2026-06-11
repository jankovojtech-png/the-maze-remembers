import { useState } from 'react';
import MainMenu from './components/MainMenu';
import GameCanvas from './components/GameCanvas';

type Screen = 'menu' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [runId,  setRunId]  = useState(0);   // increment to force GameCanvas remount
  const [hasRun, setHasRun] = useState(false);

  const startRun = () => {
    setRunId(id => id + 1);
    setHasRun(true);
    setScreen('game');
  };

  const continueRun = () => setScreen('game');
  const goToMenu    = () => setScreen('menu');

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#070b0f' }}>
      {screen === 'menu' && (
        <MainMenu
          hasActiveRun={hasRun}
          onStart={startRun}
          onContinue={continueRun}
        />
      )}

      {/* Keep GameCanvas mounted (display:none) so the run survives a menu visit */}
      <div style={{ display: screen === 'game' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
        {runId > 0 && (
          <GameCanvas key={runId} onBackToMenu={goToMenu} />
        )}
      </div>
    </div>
  );
}
