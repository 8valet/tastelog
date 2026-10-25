import { ImageResponse } from 'next/og';

export const alt = 'Tastelog — your taste, logged. A private library for movies, TV, anime, and games.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#070809', color: '#f1f2ef', padding: '70px 82px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 62, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #454744', borderRadius: 16, fontSize: 34, fontWeight: 700 }}>T</div>
        <div style={{ fontSize: 32, fontWeight: 600 }}>Tastelog</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>Your taste, logged.</div>
        <div style={{ color: '#a1a5aa', fontSize: 28 }}>One private library for everything you watch and play.</div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {['MOVIES', 'TV', 'ANIME', 'GAMES'].map(label => <div key={label} style={{ border: '1px solid #343735', borderRadius: 999, padding: '12px 20px', color: '#c9b98c', fontSize: 18, letterSpacing: 2 }}>{label}</div>)}
      </div>
    </div>,
    size,
  );
}
