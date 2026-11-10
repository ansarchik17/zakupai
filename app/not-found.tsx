import { Logo } from "@/components/primitives";
export default function NotFound() {
  return (
    <main className="status-page">
      <Logo />
      <section className="status-card">
        <h1>Страница не найдена</h1>
        <p>Проверьте ссылку или запросите её у организатора закупки.</p>
        <a className="button secondary" href="/">
          Открыть кабинет
        </a>
      </section>
    </main>
  );
}
