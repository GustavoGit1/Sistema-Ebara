// Dimensions are metres. Each full bay holds three visual pallets per level.
export function palletRackCapacity({ width, height }) {
  const levels = Math.max(1, Math.min(50, Math.floor((height + 1e-8) / 2)));
  const bays = Math.max(1, Math.min(50, Math.floor((width + 1e-8) / 3.9)));
  return { levels, bays, pallets: levels * bays * 3 };
}

export function palletRackPieces(dimensions) {
  const { width: w, height: h, depth: d } = dimensions;
  const { levels, bays } = palletRackCapacity(dimensions);
  const pieces = [];
  const add = (size, position, color, rotation = 0) => pieces.push({ size, position, color, rotation });
  const bayWidth = w / bays, levelHeight = h / levels;
  const post = Math.min(0.08, w / 30, d / 8);
  const beam = Math.min(0.12, levelHeight / 12);
  for (let b = 0; b <= bays; b++) {
    const x = -w / 2 + post / 2 + (w - post) * b / bays;
    for (const side of [-1, 1]) {
      add([post, h, post], [x, h / 2, side * (d - post) / 2], '#2563a6');
      add([post * 1.5, Math.min(0.35, h / 5), post * 1.5], [x, Math.min(0.35, h / 5) / 2, side * (d - post) / 2], '#eab308');
    }
    for (let level = 0; level < levels; level++) {
      const rise = levelHeight * 0.8, span = d - post;
      add([post / 2, Math.hypot(rise, span), post / 2], [x, levelHeight * (level + 0.5), 0], '#2563a6', (level % 2 ? -1 : 1) * Math.atan2(span, rise));
    }
  }
  for (let b = 0; b < bays; b++) {
    const center = -w / 2 + bayWidth * (b + 0.5);
    for (let level = 0; level < levels; level++) {
      const y = level * levelHeight;
      for (const side of [-1, 1])
        add([bayWidth - post, beam, post], [center, y + beam / 2, side * (d - post) / 2], '#ea580c');
      for (let p = 0; p < 3; p++) {
        const palletWidth = (bayWidth - post * 2) / 3 * 0.92;
        const x = center + (p - 1) * (bayWidth - post * 2) / 3;
        const palletHeight = Math.min(0.14, levelHeight / 10);
        add([palletWidth, palletHeight, d * 0.88], [x, y + beam + palletHeight / 2, 0], '#b58b55');
      }
    }
  }
  return pieces;
}
