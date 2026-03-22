import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPost, getBlogSlugs } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};

  const url = `https://liveport.dev/blog/${slug}`;
  return {
    title: `${post.title} — LivePort Blog`,
    description: post.description,
    authors: [{ name: `${post.author}, Derivative Labs` }],
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: "LivePort",
      type: "article",
      publishedTime: post.date,
      authors: [`${post.author}, Derivative Labs`],
      images: post.ogImage ? [{ url: post.ogImage }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: post.ogImage ? [post.ogImage] : [],
    },
    alternates: {
      canonical: url,
    },
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <article className="max-w-3xl mx-auto px-6 lg:px-12 py-12">
      {/* Back link */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors mb-10"
      >
        ← All Posts
      </Link>

      {/* Header */}
      <header className="mb-10 pb-10 border-b border-border">
        <time
          dateTime={post.date}
          className="block text-xs text-muted-foreground uppercase tracking-widest mb-4"
        >
          {formatDate(post.date)}
        </time>
        <h1 className="text-3xl lg:text-4xl font-bold uppercase tracking-tight mb-6 leading-tight">
          {post.title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed mb-6">
          {post.description}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground uppercase tracking-widest">
          <span>By {post.author}, Derivative Labs</span>
          <span>//</span>
          <span>{post.readingTime} min read</span>
        </div>
      </header>

      {/* Content */}
      <div
        className="prose-blog"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      {/* Footer nav */}
      <div className="mt-16 pt-8 border-t border-border">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors"
        >
          ← Back to Blog
        </Link>
      </div>
    </article>
  );
}
