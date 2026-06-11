import { useState } from 'react';
import MainMenu from './components/MainMenu';
import GameCanvas from './components/GameCanvas';

type Screen = 'menu' | 'game';

export default function App() {
  const [screen, setScreen]     = useState<Screen>('menu');
  const [startLevel, setStart]  = useState(1);

  if (screen === 'menu') {
    return (
      <MainMenu
        onStart={(lvl) => { setStart(lvl); setScreen('game'); }}
      />
    );
  }

  return (
    <GameCanvas
      startLevel={startLevel}
      onBackToMenu={() => setScreen('menu')}
    />
  );
}
