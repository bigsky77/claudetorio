export default function StreamPanel({ streamUrl }: { streamUrl: string }) {
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
