import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * KRONOS Avatar — paridad con .k-avatar:
 * círculo negro con filo cromado fuerte, glow y letra inicial
 * cuando no hay imagen. Sin dependencias externas.
 */
const AVATAR_SIZES = {
  sm: "size-8 text-sm",
  md: "size-10 text-base",
  lg: "size-[72px] text-lg",
};

const Avatar = forwardRef(function Avatar(
  { className, src, alt = "", fallback, size = "md", ...props },
  ref
) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const initial =
    (fallback || alt || "U").trim().slice(0, 1).toUpperCase() || "U";

  return (
    <div
      ref={ref}
      data-slot="avatar"
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-[1.5px] border-[var(--k-border-strong)] bg-black font-bold text-white shadow-[0_0_6px_rgba(255,255,255,0.2)] transition-[transform,border-color] duration-200 hover:scale-105 hover:border-white",
        AVATAR_SIZES[size],
        className
      )}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
});

export { Avatar };
