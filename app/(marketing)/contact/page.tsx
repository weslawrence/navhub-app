'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Submission failed')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 pt-24 pb-20">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8 text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            Get in Touch
          </h1>
          <p className="text-slate-400">
            Have a question? We&apos;d love to hear from you.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-7 sm:p-9">
          {success ? (
            <div className="py-8 text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Message received — we&apos;ll get back to you shortly.</p>
                <p className="text-sm text-slate-400 mt-1">Keep an eye on <strong className="text-slate-300">{form.email}</strong> for our reply.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300" htmlFor="contact-name">
                  Name <span className="text-sky-400">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Your full name"
                  className="w-full rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-slate-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-colors"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300" htmlFor="contact-email">
                  Email <span className="text-sky-400">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  placeholder="you@company.com"
                  className="w-full rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-slate-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-colors"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300" htmlFor="contact-message">
                  Message <span className="text-sky-400">*</span>
                </label>
                <textarea
                  id="contact-message"
                  required
                  value={form.message}
                  onChange={update('message')}
                  rows={5}
                  placeholder="How can we help?"
                  className="w-full rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-slate-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-colors resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors text-base"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
