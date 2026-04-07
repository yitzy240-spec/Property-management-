export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <img
        src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
        alt="Marcus Properties"
        className="mb-8 h-12 w-auto"
      />
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: April 7, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
          <p>
            ApartmentOS is a property management platform operated by Marcus Properties, Jerusalem.
            This policy explains how we collect, use, and protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Information We Collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Account information:</strong> Name, email address, and phone number for property owners, contractors, and administrators.</li>
            <li><strong>Property data:</strong> Property addresses, booking details, utility account numbers, and financial records related to property management.</li>
            <li><strong>Gmail data (administrator only):</strong> With explicit consent, we access the administrator&apos;s Gmail account to automatically detect and parse utility bills (electricity, water, gas, internet). We only read emails from known utility providers and extract billing amounts, due dates, and account numbers. We do not read personal emails.</li>
            <li><strong>Documents:</strong> Uploaded PDFs, photos, and receipts related to property maintenance and billing.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Gmail API Usage</h2>
          <p>
            ApartmentOS uses the Gmail API solely to identify and parse utility bills from the connected Gmail account.
            Specifically, we:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Search for emails from known Israeli utility providers (IEC, Hagihon, Bezeq, etc.)</li>
            <li>Download PDF attachments from bill emails</li>
            <li>Extract billing data (amount, due date, account number) using AI</li>
            <li>Store the extracted data in our secure database for property management purposes</li>
          </ul>
          <p className="mt-2">
            We do <strong>not</strong> read, store, or process any personal emails, contacts, or other Gmail data beyond utility bills.
            Gmail access can be revoked at any time through Google Account settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">How We Use Your Information</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Managing rental properties and bookings</li>
            <li>Processing and tracking utility bills</li>
            <li>Generating financial reports for property owners</li>
            <li>Sending notifications about property-related events</li>
            <li>Coordinating maintenance tasks with contractors</li>
            <li>Providing guest check-in information</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Data Storage and Security</h2>
          <p>
            Data is stored securely using Supabase (PostgreSQL) with row-level security policies.
            Sensitive information (API keys, passport numbers) is encrypted using AES-256-GCM.
            All connections use HTTPS/TLS encryption in transit.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Data Sharing</h2>
          <p>
            We do not sell or share personal data with third parties. Data is shared only with:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Property owners:</strong> Financial reports and property status for their own properties only</li>
            <li><strong>Contractors:</strong> Task details and property access codes for assigned work only</li>
            <li><strong>Service providers:</strong> Supabase (database), Vercel (hosting), Google (Gmail API), Resend (email delivery) — all under their respective privacy policies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Your Rights</h2>
          <p>You can:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Request access to your personal data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Revoke Gmail access at any time via Google Account settings</li>
            <li>Opt out of email notifications</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <p>
            For privacy questions or data requests, contact Marcus Properties at{' '}
            <a href="mailto:arielmarcus18@gmail.com" className="text-blue-600 hover:underline">
              arielmarcus18@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
