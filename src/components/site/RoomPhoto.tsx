import { useEffect, useState } from "react";
import { getRoomPhotoUrl } from "@/lib/firebase-data";
import { publicAsset } from "@/lib/hotel";

const fallbackPhoto = publicAsset("/images/room-double.jpg");

export function RoomPhoto({
  src,
  alt,
  className,
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const [resolvedSrc, setResolvedSrc] = useState(fallbackPhoto);

  useEffect(() => {
    let active = true;
    setResolvedSrc(fallbackPhoto);
    getRoomPhotoUrl(src)
      .then((url) => {
        if (active) setResolvedSrc(publicAsset(url));
      })
      .catch((error: unknown) => {
        console.error("Could not load room photo.", error);
        if (active) setResolvedSrc(fallbackPhoto);
      });
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      onError={(event) => {
        const image = event.currentTarget;
        image.onerror = null;
        image.src = fallbackPhoto;
      }}
      className={className}
    />
  );
}
