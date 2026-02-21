'use client';

interface FeaturedStreamProps {
  vtuberStreamUrl?: string | null;
  vtuberChannel?: string | null;
  vtuberPlatform?: string | null;
}

export default function FeaturedStream({ vtuberStreamUrl, vtuberChannel, vtuberPlatform }: FeaturedStreamProps) {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'claudetorio.ai';

  let src: string | null = null;
  let label: string = 'Live';

  if (vtuberChannel && vtuberPlatform) {
    // External platform embed
    src =
      vtuberPlatform === 'twitch'
        ? `https://player.twitch.tv/?channel=${vtuberChannel}&parent=${hostname}&autoplay=true`
        : `https://player.kick.com/${vtuberChannel}?autoplay=true`;
    label = `Live on ${vtuberPlatform.charAt(0).toUpperCase() + vtuberPlatform.slice(1)}`;
  } else if (vtuberStreamUrl) {
    // Direct HLS from claudetorio
    src = vtuberStreamUrl;
    label = 'Live';
  }

  if (!src) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <span className="animate-pulse w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm font-semibold uppercase tracking-wide text-white">
          {label}
        </span>
      </div>
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-zinc-700">
        <iframe
          src={src}
          className="w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    </section>
  );
}
