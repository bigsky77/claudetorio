export default function StreamPanel({
  streamUrl,
  mode = 'embedded',
}: {
  streamUrl: string;
  mode?: 'embedded' | 'background';
}) {
  if (mode === 'background') {
    return (
      <div className="absolute inset-0">
        <iframe
          src={streamUrl}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          title="Live game stream background"
        />
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
      <iframe
        src={streamUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
        title="Live game stream"
      />
    </div>
  );
}
