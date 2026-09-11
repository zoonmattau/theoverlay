// Stand-in for next/link inside the design-system bundle. Claude Design
// renders outside a Next router, so Link becomes the plain anchor it renders
// to anyway. Only the props the components use are forwarded.
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  scroll?: boolean;
  replace?: boolean;
};

export default function Link({ href, prefetch, scroll, replace, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
