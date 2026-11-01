import { useEffect, useState } from "react";
import { Quote, Star, UserRound, GraduationCap, HeartHandshake } from "lucide-react";

/**
 * "What students & parents say" — placeholder reviews.
 * Hard-coded for now; swap `DUMMY_REVIEWS` for the `/reviews` API when built.
 */
interface Review {
  id: string;
  name: string;
  role: "student" | "parent";
  programme?: string;
  rating: number;
  text: string;
}

const DUMMY_REVIEWS: Review[] = [
  {
    id: "r1",
    name: "Nimesha Perera",
    role: "student",
    programme: "Spoken English For Everyone",
    rating: 5,
    text:
      "I joined the spoken English class with a lot of hesitation, but the lecturers are so patient and supportive. In three months I was able to speak confidently in interviews. The certificate verification link also helped me land a job.",
  },
  {
    id: "r2",
    name: "Ranjith Kumara",
    role: "parent",
    programme: "School English Support (Grade 6 to 11)",
    rating: 5,
    text:
      "As a parent I can see exactly which lessons my son finished and his progress percentage. The lecturers send notes that I can review with him at home — that transparency is why I recommend this institute.",
  },
  {
    id: "r3",
    name: "Fathima Rizwana",
    role: "student",
    programme: "English For Professionals",
    rating: 4,
    text:
      "The diploma is well structured — lessons, assignments, exams and a proper final certificate. Customer support on WhatsApp answered me within minutes whenever I had an issue with payments.",
  },
  {
    id: "r4",
    name: "Sunil Bandara",
    role: "parent",
    programme: "Spoken English For Everyone",
    rating: 5,
    text:
      "My daughter was too shy to speak in English. The counselling sessions and the regular progress reports made a real difference. Very happy with the institute.",
  },
  {
    id: "r5",
    name: "Kasun Jayasuriya",
    role: "student",
    programme: "School English Support (Grade 6 to 11)",
    rating: 5,
    text:
      "Lessons are short and easy to follow, and I can retake any lesson before the exam. My grades improved from C to A in one term.",
  },
  {
    id: "r6",
    name: "Dilrukshi Silva",
    role: "student",
    programme: "English For Professionals",
    rating: 4,
    text:
      "Great value for money, especially with the membership discount. The lecturer notes after each module were the most useful revision material I've had.",
  },
];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? "fill-warning text-warning" : "text-muted"}`} />
      ))}
    </div>
  );
}

export function Testimonials() {
  const [items, setItems] = useState<Review[]>(DUMMY_REVIEWS);

  useEffect(() => {
    // Placeholder: keep dummy data until a real reviews API exists.
    setItems(DUMMY_REVIEWS);
  }, []);

  return (
    <section className="border-y border-border bg-surface2/50 py-16">
      <div className="container-x">
        <div className="mb-8 text-center">
          <p className="badge bg-primary/10 text-primary">Reviews</p>
          <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">What students & parents say</h2>
          <p className="mt-1 text-muted">Real feedback about our institute and programmes.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <div key={r.id} className="card relative flex flex-col p-6">
              <Quote className="absolute right-4 top-4 h-8 w-8 text-primary/10" />
              <Stars n={r.rating} />
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink">"{r.text}"</p>
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${
                    r.role === "parent" ? "bg-accent" : "bg-gradient-to-br from-primary to-primary2"
                  }`}
                >
                  {r.role === "parent" ? <HeartHandshake className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{r.name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.role === "parent" ? "Parent" : "Student"}
                    {r.programme ? ` · ${r.programme}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> 1,200+ students trained
          </span>
          <span className="inline-flex items-center gap-2">
            <Star className="h-4 w-4 fill-warning text-warning" /> 4.8 average rating
          </span>
          <span className="inline-flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-accent" /> 400+ happy parents
          </span>
        </div>
      </div>
    </section>
  );
}
