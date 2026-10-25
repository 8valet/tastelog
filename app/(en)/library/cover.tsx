'use client';

/* Known providers use responsive optimization; custom artwork keeps a native fallback. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Work } from '../../../lib/library/model';
import { posterSources } from '../../../lib/library/artwork';
import { canOptimizePoster } from '../../../lib/image-policy';

export function Cover({ work, className = '', eager = false, onImageLoad }: { work: Work; className?: string; eager?: boolean; onImageLoad?: (image: HTMLImageElement) => void }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const imageRef = useRef<HTMLImageElement>(null);
  const source = posterSources(work).find(url => !failedSources.includes(url));
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) onImageLoad?.(image);
  }, [onImageLoad, source]);
  if (!source) return <span aria-hidden="true" data-media-type={work.type} className={`missing-cover ${className}`}>No cover</span>;

  const imageProps = { ref: imageRef, className, 'data-media-type': work.type, src: source,
    width: work.type === 'games' ? 264 : 200, height: work.type === 'games' ? 352 : 300,
    loading: eager ? 'eager' as const : 'lazy' as const,
    fetchPriority: eager ? 'high' as const : 'auto' as const,
    onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => onImageLoad?.(event.currentTarget),
    onError: () => setFailedSources(previous => previous.includes(source) ? previous : [...previous, source]),
  };
  if (canOptimizePoster(source)) return <Image alt="" {...imageProps} sizes="(max-width: 760px) 30vw, (max-width: 1100px) 20vw, 220px" />;
  return <img alt="" {...imageProps} />;
}
