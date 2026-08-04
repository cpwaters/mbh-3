import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad } from './SignaturePad';

// jsdom has no canvas 2D backend, so the pad's own drawing calls need a stub
// context — the point isn't to test <canvas> rendering, it's to test that
// "Clear signature" actually resets the pad and reports it (the actionable
// part a driver clicks).
const ctxStub = {
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctxStub as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,stub');
});

describe('SignaturePad', () => {
  it('reports a signature once ink is drawn', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    const canvas = document.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });

    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,stub');
  });

  it('"Clear signature" erases the canvas and reports no signature', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    const canvas = document.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    onChange.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Clear signature' }));

    expect(ctxStub.clearRect).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clicking Clear with no ink drawn is a harmless no-op signature-wise', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear signature' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
