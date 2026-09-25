import { notFound } from 'next/navigation';

// Any unknown path under a language prefix shows the translated "page not found" screen.
export default function CatchAll() {
  notFound();
}
