// Brand icons come from the design-system sprite, not an icon library. The
// 14 marks in assets/sprite.svg ARE the brand's icon language (README: "build
// against this, not ad-hoc values"), and .icon in globals.css supplies the
// stroke treatment.

export type IconName =
  | "i-arrow-right"
  | "i-chart"
  | "i-check"
  | "i-clipboard"
  | "i-cpu"
  | "i-mail"
  | "i-menu"
  | "i-network"
  | "i-phone"
  | "i-pin"
  | "i-search"
  | "i-shield"
  | "i-speed"
  | "i-star";

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg className={`icon ${className}`} aria-hidden="true">
      <use href={`/design-system/assets/sprite.svg#${name}`} />
    </svg>
  );
}
