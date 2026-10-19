import { publicAsset } from "@/lib/hotel";

type BrandLogoProps = {
  size?: "header" | "footer" | "auth" | "staff";
  subtitle?: string;
};

const sizes = {
  header: {
    mark: "size-14 md:size-16",
    name: "text-xl md:text-2xl",
    subtitle: "text-[0.52rem] md:text-[0.6rem]",
  },
  footer: {
    mark: "size-16 md:size-20",
    name: "text-2xl md:text-3xl",
    subtitle: "text-[0.58rem] md:text-[0.65rem]",
  },
  auth: {
    mark: "size-20 md:size-24",
    name: "text-3xl",
    subtitle: "text-[0.65rem]",
  },
  staff: {
    mark: "size-12",
    name: "text-xl",
    subtitle: "text-[0.55rem]",
  },
};

export function BrandLogo({ size = "header", subtitle = "Jaffna · Hotel" }: BrandLogoProps) {
  const style = sizes[size];

  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <img
        src={publicAsset("/images/vaasal-villa-emblem.svg")}
        alt=""
        className={`${style.mark} shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.22)]`}
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`whitespace-nowrap font-display ${style.name}`}>Vaasal Villa</span>
        <span
          className={`mt-1.5 whitespace-nowrap font-sans uppercase tracking-[0.32em] text-gold ${style.subtitle}`}
        >
          {subtitle}
        </span>
      </span>
    </span>
  );
}
