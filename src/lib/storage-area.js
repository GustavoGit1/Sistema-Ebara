export function areaGrid(area = { width: 40, depth: 40 }, step = 1) {
  const { width, depth } = area;
  // Bound geometry cost while keeping equal spacing along both axes.
  const spacing = Math.max(step || 1, Math.max(width, depth) / 1000);
  const points = [];
  const line = (x1, z1, x2, z2) => points.push(x1, 0.005, z1, x2, 0.005, z2);
  for (let x = -width / 2; x < width / 2 - 1e-8; x += spacing) line(x, -depth / 2, x, depth / 2);
  for (let z = -depth / 2; z < depth / 2 - 1e-8; z += spacing) line(-width / 2, z, width / 2, z);
  line(width / 2, -depth / 2, width / 2, depth / 2);
  line(-width / 2, depth / 2, width / 2, depth / 2);
  return points;
}
