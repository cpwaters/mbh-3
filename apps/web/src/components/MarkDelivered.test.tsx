import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkDelivered, type ActiveJob } from './MarkDelivered';

const putMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/blob-store', () => ({
  getBlobStore: () => ({ put: putMock }),
}));

const job: ActiveJob = {
  jobId: 'job-1',
  carrierTenantId: 'carrier-1',
  origin: 'Trafford, M17 1WS',
  destination: 'Leith, EH6 6JJ',
};

function file(name: string, sizeBytes: number, type = 'image/jpeg'): File {
  const f = new File([new Uint8Array(sizeBytes)], name, { type });
  return f;
}

describe('MarkDelivered — real photo capture', () => {
  it('stores the real file bytes locally under a local-blob: key, not a fake placeholder ref', async () => {
    putMock.mockClear();
    const user = userEvent.setup();
    render(<MarkDelivered job={job} onCommit={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file('goods.jpg', 1024));

    await waitFor(() => expect(screen.getByText('1 photo(s) captured')).toBeInTheDocument());
    expect(putMock).toHaveBeenCalledTimes(1);
    const [key, blob] = putMock.mock.calls[0] as [string, File];
    expect(key).toMatch(/^local-blob:/);
    expect(blob.name).toBe('goods.jpg');
  });

  it('refuses a photo over 10MB with a clear error, without storing it', async () => {
    putMock.mockClear();
    const user = userEvent.setup();
    render(<MarkDelivered job={job} onCommit={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file('huge.jpg', 11 * 1024 * 1024));

    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
    expect(putMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/photo\(s\) captured/)).not.toBeInTheDocument();
  });

  it('submits a deliverJob payload whose photoRefs are local-blob keys', async () => {
    putMock.mockClear();
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MarkDelivered job={job} onCommit={onCommit} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file('goods.jpg', 1024));
    await waitFor(() => expect(screen.getByText('1 photo(s) captured')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/recipient name/i), 'J. Smith');

    // Draw on the signature pad the same way SignaturePad.test.tsx does —
    // jsdom has no real canvas backend, so stub just enough to get a value.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,stub');
    const canvas = document.querySelector('canvas')!;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });

    await user.click(screen.getByRole('button', { name: 'Record delivery' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const [, payload] = onCommit.mock.calls[0] as [string, { photoRefs: string[]; signatureRef: string }];
    expect(payload.photoRefs).toHaveLength(1);
    expect(payload.photoRefs[0]).toMatch(/^local-blob:/);
    expect(payload.signatureRef).toBe('data:image/png;base64,stub');
  });
});
