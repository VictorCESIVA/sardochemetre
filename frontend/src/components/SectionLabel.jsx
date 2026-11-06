import { createElement } from 'react';

export default function SectionLabel({
  as = 'span',
  children,
  className = '',
  ...props
}) {
  return createElement(
    as,
    {
      className: `eyebrow inline-flex items-center gap-2 text-ink-muted ${className}`,
      ...props,
    },
    createElement('span', {
      'aria-hidden': 'true',
      className: 'h-px w-5 shrink-0 bg-vermillion',
    }),
    createElement('span', null, children),
  );
}
