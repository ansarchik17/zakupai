"use client";
import { Button, Logo } from "@/components/primitives";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="status-page">
      <Logo />
      <section className="status-card">
        <h1>Не удалось загрузить страницу</h1>
        <p>Проверьте соединение и попробуйте ещё раз.</p>
        <Button onClick={reset}>Повторить загрузку</Button>
      </section>
    </main>
  );
}
