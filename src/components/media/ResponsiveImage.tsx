import type { BuildingImage } from "@/lib/building-images.generated";

interface ResponsiveImageProps {
  /** Directory the derivatives live in, e.g. "/buildings/woodward-hall". */
  dir?: string;
  image?: BuildingImage;
  /** Used when no derivatives exist (e.g. a database-provided image_url). */
  src?: string;
  alt: string;
  /** `sizes` hint — how wide the image renders at the relevant breakpoints. */
  sizes: string;
  className?: string;
  /** Set on the one image that is likely the LCP element. */
  priority?: boolean;
}

function srcSet(dir: string, image: BuildingImage, ext: "avif" | "webp") {
  return image.widths.map((w) => `${dir}/${image.name}-${w}.${ext} ${w}w`).join(", ");
}

/**
 * A `<picture>` over the AVIF/WebP/JPEG derivatives produced by
 * scripts/optimize-images.mjs.
 *
 * Deliberately not `next/image`: these are pre-generated at build time, so
 * runtime optimization would re-encode already-optimal files and add per-request
 * cost. Intrinsic width/height come from the generated manifest so the browser
 * reserves layout space and the gallery does not shift as photos load.
 */
export default function ResponsiveImage({
  dir,
  image,
  src,
  alt,
  sizes,
  className,
  priority = false,
}: ResponsiveImageProps) {
  const hasDerivatives = Boolean(dir && image);
  const fallback = hasDerivatives
    ? `${dir}/${image!.name}-${image!.fallbackWidth}.jpg`
    : src;

  return (
    <picture>
      {hasDerivatives && (
        <>
          <source type="image/avif" srcSet={srcSet(dir!, image!, "avif")} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet(dir!, image!, "webp")} sizes={sizes} />
        </>
      )}
      <img
        src={fallback}
        alt={alt}
        width={image?.width}
        height={image?.height}
        className={className}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
