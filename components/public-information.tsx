import Link from "next/link";

export function SupportContactLink() {
  return <a href="mailto:hashim.ghub@gmail.com" className="break-all underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">hashim.ghub@gmail.com</a>;
}

export const PUBLIC_INFORMATION_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms & acceptable use" },
  { href: "/support", label: "Help & contact" },
  { href: "/data-deletion", label: "Account & data deletion" },
  { href: "/about", label: "About & credits" },
] as const;

export function PublicInformationLinks({ label }: { label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {PUBLIC_INFORMATION_LINKS.map(({ href, label: text }) => (
          <li key={href}>
            <Link href={href} className="inline-flex min-h-11 items-center rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-background px-4 py-5 text-muted-foreground sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <p className="text-sm font-medium text-foreground">WatchFlow</p>
        <PublicInformationLinks label="Public information" />
        <p className="text-sm"><SupportContactLink /></p>
      </div>
    </footer>
  );
}

export function InformationPage({ title, summary, children }: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{summary}</p>
        <p className="mt-3 text-sm text-muted-foreground">Updated 4 November 2026</p>
      </header>
      <div className="space-y-7 break-words text-sm leading-7 [&_a]:rounded-sm [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:pl-1 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-6">
        {children}
      </div>
    </article>
  );
}
