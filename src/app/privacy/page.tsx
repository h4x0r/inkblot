import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Inkblot",
  description: "How Inkblot handles your data.",
};

// NOTE (dev): AI-drafted, tailored to the app's actual data flows. Have it
// reviewed by counsel before relying on it.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Last updated: 24 June 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          Inkblot (&ldquo;the Service&rdquo;), operated by Security Ronin Ltd
          (&ldquo;we&rdquo;), turns GitHub commit activity into a streamgraph
          chart. This policy explains what we process and why. In short: we read
          commit <em>metadata</em>, not your code, and we run no database — most
          data is transient.
        </p>

        <section>
          <h2 className="text-lg font-semibold">What we process</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>If you sign in with GitHub:</strong> your GitHub identity
              (login, name, avatar) and an OAuth access token (scopes{" "}
              <code>read:user</code> and <code>repo</code>). The token is stored
              only in an encrypted session cookie in your browser — never in a
              database — and is used solely to read your commit metadata on your
              behalf. It is cleared when you sign out or when the session
              expires.
            </li>
            <li>
              <strong>Commit metadata:</strong> repository names and commit
              timestamps, used to draw the chart. We do not read, store, or
              transmit your source code.
            </li>
            <li>
              <strong>
                Public pages (<code>/u/&lt;username&gt;</code>):
              </strong>{" "}
              the requested user&rsquo;s <em>public</em> commit metadata,
              fetched with no login. Only public data is used on this path.
            </li>
            <li>
              <strong>Shared images:</strong> if you create a share link, the
              rendered chart image is stored at an unguessable URL on Vercel
              Blob and automatically deleted after about 30 days.
            </li>
            <li>
              <strong>Operational logs:</strong> we write structured log lines
              for sign-ins and chart requests (the GitHub login or queried
              username, repository count, lookback window, and detected
              persona). These go to our platform/observability logs and are
              retained per that provider&rsquo;s log retention. We also use
              Vercel Web Analytics, which counts page views without cookies and
              without identifying you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">How we use it</h2>
          <p className="mt-2">
            Only to generate and display the charts and to operate, secure, and
            improve the Service. We do not sell your data and we show no ads.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Processors</h2>
          <p className="mt-2">
            We rely on: <strong>GitHub</strong> (authentication and the source
            of commit data), <strong>Vercel</strong> (hosting, serverless
            functions, Blob storage, and analytics), and <strong>Axiom</strong>{" "}
            (log storage). Each processes data on our behalf under its own
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Retention</h2>
          <p className="mt-2">
            We keep no application database. The access token lives only in your
            cookie; shared images expire after ~30 days; logs follow our
            providers&rsquo; retention windows.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Your choices &amp; rights</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              Revoke Inkblot&rsquo;s access anytime at{" "}
              <a
                className="text-primary underline-offset-4 hover:underline"
                href="https://github.com/settings/applications"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/settings/applications
              </a>
              .
            </li>
            <li>
              To remove a shared image before it expires, or to exercise data
              rights under the GDPR/CCPA (access, deletion, objection), contact
              us below.
            </li>
          </ul>
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
