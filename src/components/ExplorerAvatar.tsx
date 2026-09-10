"use client";

type Props = {
  src?: string;
  name: string;
  size?: number;
  className?: string;
};

export function ExplorerAvatar({ src, name, size = 40, className = "" }: Props) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  const rounded = size >= 64 ? "rounded-2xl" : "rounded-full";
  const font =
    size >= 72 ? "text-3xl" : size >= 40 ? "text-sm" : "text-[11px]";

  if (src) {
    return (
      // data: URLs — next/image is the wrong tool here
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-cover ${rounded} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-purple-600/80 to-gold font-black text-white shadow-gold ${rounded} ${font} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
