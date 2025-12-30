import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b border-border px-6 lg:px-12 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            LIVE<span className="text-primary">PORT</span>_
          </span>
        </Link>
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8 tracking-tighter">TERMS OF SERVICE</h1>
        
        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">1. Acceptance of Terms</h2>
            <p>
              By accessing or using LivePort (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">2. Description of Service</h2>
            <p>
              LivePort provides secure localhost tunneling services that allow developers and AI agents to
              expose local applications to the internet through temporary, authenticated connections.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">3. User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You are responsible for maintaining the confidentiality of your bridge keys</li>
              <li>You must not use the Service for any illegal or unauthorized purpose</li>
              <li>You must not transmit any malicious code or interfere with the Service</li>
              <li>You are responsible for all activity that occurs under your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">4. Service Limitations</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. We reserve the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Modify or discontinue the Service at any time</li>
              <li>Impose usage limits or restrictions</li>
              <li>Terminate accounts that violate these terms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">5. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              We collect minimal data necessary to operate the Service and do not inspect or store the content
              of your tunneled traffic.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">6. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, LivePort shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages resulting from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">7. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the Service after changes
              constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">8. Contact</h2>
            <p>
              For questions about these terms, please contact us through our GitHub repository.
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-border text-sm">
            <p>Last Updated: November 28, 2025</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            LivePort © 2025 // All Systems Nominal
          </div>
          <div className="flex gap-8 text-sm font-bold uppercase tracking-wider">
            <Link href="/terms" className="text-primary">Terms</Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-primary">Privacy</Link>
            <Link href="/status" className="text-muted-foreground hover:text-primary">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
