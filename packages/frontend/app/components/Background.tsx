'use client';

export function Background() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 opacity-50"
      style={{
        backgroundImage:
          'radial-gradient(700px 400px at 20% 10%, rgba(255,255,255,0.08), transparent 60%),' +
          'radial-gradient(700px 400px at 80% 25%, rgba(255,140,0,0.11), transparent 55%),' +
          'radial-gradient(500px 300px at 70% 90%, rgba(0,255,140,0.05), transparent 60%),' +
          'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px),' +
          'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, auto, 40px 40px, 40px 40px',
      }}
    />
  );
}
