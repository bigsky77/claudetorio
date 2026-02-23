const PREFIXES = [
  'Cheshire', 'Nebula', 'Quantum', 'Mad', 'Cosmic', 'Velvet', 'Dormouse',
  'Phantom', 'Crystal', 'Shadow', 'Iron', 'Copper', 'Circuit', 'Arcane',
  'Stellar', 'Twilight', 'Neon', 'Cipher', 'Flux', 'Cobalt',
  'Ember', 'Frostbite', 'Glitch', 'Pixel', 'Rune',
];

const SUFFIXES = [
  'Hatter', 'Cat', 'Bot', 'Alice', 'Pilot', 'Knight', 'Forge',
  'Rabbit', 'Walker', 'Spark', 'Ghost', 'Fox', 'Owl', 'Raven',
  'Weaver', 'Smith', 'Runner', 'Gear', 'Bolt', 'Cog',
  'Moth', 'Wolf', 'Crane', 'Hawk', 'Lynx',
];

const STORAGE_KEY = 'chat_username';

function generateUsername(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  const num = Math.floor(Math.random() * 100);
  return `${prefix}${suffix}${num}`;
}

export function getOrCreateUsername(): string {
  if (typeof window === 'undefined') return generateUsername();

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const name = generateUsername();
  localStorage.setItem(STORAGE_KEY, name);
  return name;
}
