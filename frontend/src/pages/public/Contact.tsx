import { useState } from "react";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../store/auth";
import { Alert, Button, Card, Field, Input, Textarea } from "../../components/ui";
import { HeroDecor } from "../../components/HeroDecor";
import { ApiError } from "../../lib/api";

export default function Contact() {
  const { settings } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/contact", form);
      setDone(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden py-14">
      <HeroDecor variant="soft" />
      <div className="container-x relative">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className="badge bg-primary/10 text-primary">Contact Us</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">We'd love to hear from you</h1>
          <p className="mt-3 max-w-lg text-muted">
            Questions about classes, courses, diplomas or memberships? Send us a message and our team will get back to you.
          </p>
          <div className="mt-8 space-y-4">
            {settings?.contact_email && (
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Mail className="h-4 w-4" /></span>
                {settings.contact_email}
              </div>
            )}
            {settings?.contact_phone && (
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Phone className="h-4 w-4" /></span>
                {settings.contact_phone}
              </div>
            )}
            {settings?.address && (
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><MapPin className="h-4 w-4" /></span>
                {settings.address}
              </div>
            )}
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          {done ? (
            <div className="py-10 text-center">
              <Send className="mx-auto h-10 w-10 text-success" />
              <p className="mt-4 text-lg font-bold">Message sent!</p>
              <p className="mt-1 text-sm text-muted">We'll reply to your email as soon as possible.</p>
              <Button className="mt-6" onClick={() => setDone(false)}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <Alert type="error">{error}</Alert>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
                </Field>
                <Field label="Email">
                  <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone (optional)">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 234 567" />
                </Field>
                <Field label="Subject">
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="How can we help?" />
                </Field>
              </div>
              <Field label="Message">
                <Textarea required minLength={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write your message..." />
              </Field>
              <Button type="submit" loading={busy} className="w-full">
                Send Message <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}
