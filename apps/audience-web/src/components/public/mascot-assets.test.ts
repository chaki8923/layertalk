import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { mascotVariants } from "./mascot-data";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("mascot assets and face protection", () => {
  it.each(Object.entries(mascotVariants))("preserves %s and covers facial marks throughout the squash", async (_variant, asset) => {
    const filename = asset.src.split("/").at(-1)!;
    const source = await readFile(resolve(repository, "assets/branding/mascot", filename));
    const publicCopy = await readFile(resolve(repository, "apps/audience-web/public/mascot", filename));
    expect(publicCopy.equals(source)).toBe(true);
    const image = sharp(source);
    expect(await image.metadata()).toMatchObject({ width: 1536, height: 1024, hasAlpha: true });
    const statistics = await image.stats();
    expect(statistics.channels[3]!.min).toBe(0);

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const originX = asset.face.x / 100 * info.width;
    const originY = asset.face.y / 100 * info.height;
    const radiusX = asset.face.rx / 100 * info.width;
    const radiusY = asset.face.ry / 100 * info.height;
    let marks = 0;
    let maximumRadius = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const pixel = (y * info.width + x) * 4;
        // The opaque dark pixels are the eyes and mouth, excluding the soft shadow.
        if (data[pixel + 3]! < 230 || Math.max(data[pixel]!, data[pixel + 1]!, data[pixel + 2]!) >= 145) continue;
        marks++;
        for (const reaction of [-.027, 0, .06]) {
          for (const ambient of [-.012, .012]) {
            for (const skew of [-.4, .4]) {
              const dx = (x - originX) * (1 + reaction);
              const dy = (y - originY) * (1 - reaction);
              const projectedX = (1 + ambient) * (dx + Math.tan(skew * Math.PI / 180) * dy);
              const projectedY = (1 - ambient) * dy;
              maximumRadius = Math.max(maximumRadius, Math.hypot(projectedX / radiusX, projectedY / radiusY));
            }
          }
        }
      }
    }
    expect(marks).toBeGreaterThan(20);
    // The protected layer is fully present until 65% of its ellipse radius.
    expect(maximumRadius).toBeLessThan(.65);
  });
});
