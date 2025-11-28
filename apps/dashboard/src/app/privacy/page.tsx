import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold mb-8 tracking-tighter">PRIVACY POLICY</h1>
        
        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">1. Information We Collect</h2>
            <p className="mb-4">We collect minimal information necessary to provide the Service:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Account Information:</strong> Email address and name (if provided)</li>
              <li><strong>Bridge Keys:</strong> Cryptographic key metadata (not the keys themselves)</li>
              <li><strong>Usage Data:</strong> Connection timestamps, tunnel metadata, and usage statistics</li>
              <li><strong>Technical Data:</strong> IP addresses, user agent strings, and error logs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">2. What We Don't Collect</h2>
            <p className="mb-4">We explicitly do NOT collect or store:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>The content of your tunneled traffic</li>
              <li>Application data passing through tunnels</li>
              <li>Full bridge keys (only hashed versions are stored)</li>
              <li>Sensitive application secrets or credentials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">3. How We Use Your Information</h2>
            <p className="mb-4">We use collected information to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide and maintain the tunneling service</li>
              <li>Authenticate and authorize tunnel connections</li>
              <li>Monitor service health and performance</li>
              <li>Prevent abuse and enforce rate limits</li>
              <li>Improve the Service and fix bugs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">4. Data Storage and Security</h2>
            <p>
              Your data is stored securely using industry-standard encryption. Bridge keys are hashed using
              bcrypt before storage. We use secure connections (TLS/SSL) for all data transmission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">5. Data Sharing</h2>
            <p className="mb-4">We do not sell or share your personal information with third parties, except:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>When required by law or legal process</li>
              <li>To protect our rights or the safety of others</li>
              <li>With service providers who help us operate the Service (under strict confidentiality)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">6. Data Retention</h2>
            <p>
              We retain your data only as long as necessary to provide the Service. You can request deletion
              of your account and associated data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">7. Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Opt out of non-essential data collection</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">8. Cookies and Tracking</h2>
            <p>
              We use essential cookies for authentication and session management. We do not use third-party
              tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes
              via email or through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4 uppercase">10. Contact Us</h2>
            <p>
              For privacy-related questions or requests, please contact us through our GitHub repository.
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
            <Link href="/terms" className="text-muted-foreground hover:text-primary">Terms</Link>
            <Link href="/privacy" className="text-primary">Privacy</Link>
            <Link href="/status" className="text-muted-foreground hover:text-primary">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
