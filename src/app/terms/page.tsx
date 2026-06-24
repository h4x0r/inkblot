import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Inkblot",
  description: "The terms for using Inkblot.",
};

// NOTE (dev): AI-drafted starting point (governing law: Hong Kong SAR). Have it
// reviewed by counsel before relying on it.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Last updated: 24 June 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          By using Inkblot (&ldquo;the Service&rdquo;), provided by Security
          Ronin Ltd (&ldquo;we&rdquo;), you agree to these Terms. If you do not
          agree, do not use the Service.
        </p>

        <section>
          <h2 className="text-lg font-semibold">The service</h2>
          <p className="mt-2">
            Inkblot renders GitHub commit activity as a chart, from your own
            account (after sign-in) or any public GitHub username. It is
            provided free of charge and <strong>&ldquo;as is&rdquo;</strong>,
            without warranties of any kind. We may change or discontinue it at
            any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Acceptable use</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              Don&rsquo;t abuse, overload, or attempt to disrupt the Service.
            </li>
            <li>
              Don&rsquo;t use it to harass others or for any unlawful purpose.
            </li>
            <li>Respect GitHub&rsquo;s Terms of Service and rate limits.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Public data &amp; takedown</h2>
          <p className="mt-2">
            Public pages display commit <em>metadata</em> that GitHub already
            makes public. If you are a developer whose public chart you&rsquo;d
            like removed, email us and we will take it down.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Intellectual property</h2>
          <p className="mt-2">
            GitHub data belongs to its respective owners. The Inkblot source
            code is released under the MIT License. Charts you generate are
            yours to share.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Disclaimer &amp; liability</h2>
          <p className="mt-2">
            The Service is provided without warranty. To the maximum extent
            permitted by law, Security Ronin Ltd is not liable for any indirect,
            incidental, or consequential damages arising from your use of the
            Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Changes &amp; governing law</h2>
          <p className="mt-2">
            We may update these Terms; continued use means acceptance. These
            Terms are governed by the laws of the Hong Kong Special
            Administrative Region of the People&rsquo;s Republic of China, and
            you submit to the exclusive jurisdiction of its courts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2">
            Security Ronin Ltd —{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="mailto:albert@securityronin.com"
            >
              albert@securityronin.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
