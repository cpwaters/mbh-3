import { useRef, useState } from 'react';

// A minimal pointer-drawn signature pad. Produces a data-URL ref on capture.
// (Real uploads to object storage are a later slice; the ref is the payload
// the PoD carries.)
export function SignaturePad({ onChange }: { onChange: (ref: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange(canvasRef.current!.toDataURL('image/png'));
    }
  }

  function end() {
    drawing.current = false;
    if (hasInk && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  }

  function clear() {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{ border: '1px solid #d1d5db', borderRadius: 8, touchAction: 'none', width: '100%', maxWidth: 320 }}
      />
      <div>
        <button type="button" onClick={clear} style={{ color: '#dc2626', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer' }}>
          Clear signature
        </button>
      </div>
    </div>
  );
}
