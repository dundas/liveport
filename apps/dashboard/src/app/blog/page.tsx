import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — LivePort",
  description:
    "Insights on AI agent development, localhost tunneling, and developer tooling from the LivePort team.",
  openGraph: {
    title: "Blog — LivePort",
    description:
      "Insights on AI agent development, localhost tunneling, and developer tooling from the LivePort team.",
    url: "https://liveport.dev/blog",
    siteName: "LivePort",
    type: "website",
  },
  alternates: {
    canonical: "https://liveport.dev/blog",
    types: {
      "application/rss+xml": "https://liveport.dev/blog/rss.xml",
    },
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <>
      {/* Hero */}
      <div className="border-b border-border py-12 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 border border-primary/50 px-3 py-1.5 text-xs text-primary uppercase tracking-widest">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              LivePort Blog
            </div>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold uppercase tracking-tight mb-4">
            From the <span className="text-primary">Trenches</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
            Tunnels, AI agents, and the developer tools we wish existed.
          </p>
        </div>
      </div>

      {/* Posts */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
        {posts.length === 0 ? (
          <div className="border border-border p-12 text-center">
            <div className="text-muted-foreground uppercase tracking-widest text-sm mb-2">
              Coming soon
            </div>
            <p className="text-foreground font-bold text-xl">
              First post drops Monday.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <article key={post.slug} className="py-10 group">
                <Link href={`/blog/${post.slug}`} className="block">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                    <time
                      dateTime={post.date}
                      className="text-xs text-muted-foreground uppercase tracking-widest"
                    >
                      {formatDate(post.date)}
                    </time>
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">
                      {post.readingTime} min read
                    </span>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold uppercase tracking-tight mb-3 group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4 max-w-3xl">
                    {post.description}
                  </p>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">
                      By {post.author}, Derivative Labs
                    </span>
                    <span className="text-xs text-primary uppercase tracking-widest font-bold group-hover:underline">
                      Read →
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
